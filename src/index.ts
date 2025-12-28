import 'dotenv/config';
import * as express from 'express';
import * as http from 'http';
import * as cors from 'cors';
import { Server } from 'socket.io';
import { ChatRoomManager } from './ChatRoomManager';
import { verifyGoogleIdToken, signJwt, verifyJwt, parseTokenFromCookie } from './auth';

// Handle CJS/ESM interop for express and cors in various runtimes
const expressFn: any = (express as any).default ?? (express as any);
const corsFn: any = (cors as any).default ?? (cors as any);
const app = expressFn();
const server = http.createServer(app);

const PORT = process.env.PORT || 4000;
const ORIGIN = process.env.ORIGIN || 'http://localhost:5173';
// Allow multiple dev origins (5173 React, 4000 static) and be permissive in dev
const devCorsOrigin = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
  // In dev, allow any localhost origin to simplify testing
  if (!origin || /localhost|127\.0\.0\.1/.test(origin)) return callback(null, true);
  // Fallback to configured ORIGIN
  if (origin === ORIGIN) return callback(null, true);
  return callback(null, false);
};

const io = new Server(server, {
  cors: { origin: devCorsOrigin, credentials: true }
});

app.use(corsFn({ origin: devCorsOrigin, credentials: true }));
app.use(expressFn.json());
// Serve static frontend
app.use(expressFn.static('public'));
// Expose client ID to browser
app.get('/config.js', (_req, res) => {
  const gid = process.env.GOOGLE_CLIENT_ID || '';
  res.type('application/javascript').send(`window.__GOOGLE_CLIENT_ID__=${JSON.stringify(gid)};`);
});

// ---- Auth endpoints ----
app.post('/api/auth/google', async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ error: 'Missing idToken' });
    const user = await verifyGoogleIdToken(idToken);
    const jwt = signJwt(user);
    // httpOnly cookie for sockets
    res.cookie('token', jwt, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false, // set true behind HTTPS
      maxAge: 2 * 60 * 60 * 1000,
    });
    res.json({ user });
  } catch (e) {
    console.error(e);
    res.status(401).json({ error: 'Auth failed' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

// Basic health
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// ---- Socket logic ----
const store = new ChatRoomManager(200);

// Auth middleware
/**io.use((socket, next) => {
  try {
    const token = parseTokenFromCookie(socket.handshake.headers.cookie || '');
    if (!token) return next(new Error('No auth token'));
    const user = verifyJwt(token);
    socket.user = { id: user.sub, email: user.email, name: user.name, picture: user.picture };
    next();
  } catch (err) {
    next(new Error('Auth invalid'));
  }
});
**/

io.on('connection', (socket) => {
  // Send current rooms
  console.log(`User connected: ${socket.user?.email || 'unknown'}`);
  socket.emit('rooms:update', store.listRooms());

  socket.on('room:create', (roomName, cb) => {
    if (!roomName || typeof roomName !== 'string') return cb && cb({ error: 'Invalid name' });
    store.ensureRoom(roomName);
    io.emit('rooms:update', store.listRooms());
    cb && cb({ ok: true });
  });

  socket.on('room:join', (roomName, cb) => {
    if (!roomName) return cb && cb({ error: 'Missing room' });
    socket.join(roomName);
    store.addUser(roomName, socket.id, socket.user);
    io.to(roomName).emit('room:users', store.getUsers(roomName));
    socket.emit('room:history', { room: roomName, messages: store.getMessages(roomName) });
    io.emit('rooms:update', store.listRooms());
    cb && cb({ ok: true });
  });

  socket.on('room:leave', (roomName, cb) => {
    socket.leave(roomName);
    store.removeUser(roomName, socket.id);
    io.to(roomName).emit('room:users', store.getUsers(roomName));
    io.emit('rooms:update', store.listRooms());
    cb && cb({ ok: true });
  });

  socket.on('message:send', ({ room, text }, cb) => {
    if (!room || typeof text !== 'string' || !text.trim()) return cb && cb({ error: 'Invalid message' });
    const msg = {
      id: Math.random().toString(36).slice(2),
      room,
      text: text.trim(),
      at: Date.now(),
      user: socket.user,
    };
    store.addMessage(room, msg);
    io.to(room).emit('message:new', msg);
    cb && cb({ ok: true, id: msg.id });
  });

  socket.on('disconnecting', () => {
    // Remove user from all rooms they're in
    const rooms = [...socket.rooms].filter((r) => r !== socket.id);
    rooms.forEach((r) => {
      store.removeUser(r, socket.id);
      io.to(r).emit('room:users', store.getUsers(r));
    });
    io.emit('rooms:update', store.listRooms());
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});