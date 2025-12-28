# Espresso Chat

A real-time multi-room chat application with Google authentication.

## Stack
- Backend: Node.js + Express + Socket.IO (TypeScript, run via `tsx`)
- Frontend: React + TypeScript (Vite), or a minimal static client in `public/`

## Prerequisites
- Node.js 18+ (tested on Node 24)
- pnpm 10+
- A Google OAuth Client ID (Web application)

## Environment
Create a `.env` file in the project root:

```
PORT=4000
ORIGIN=http://localhost:5173
GOOGLE_CLIENT_ID=YOUR_GOOGLE_OAUTH_CLIENT_ID
JWT_SECRET=some_dev_secret
```

- `PORT`: Backend server port.
- `ORIGIN`: Allowed frontend origin for CORS (default Vite dev server).
- `GOOGLE_CLIENT_ID`: From Google Cloud Console → OAuth client (type: Web).
- `JWT_SECRET`: Any secret string for signing JWT.

## Install

```
pnpm install
```

This installs server and shared dev deps. The React app has its own `package.json` in `frontend/` and will be driven by root scripts.

## Run (Development)
Start the backend:

```
pnpm dev
```

Start the React frontend:

```
pnpm client
```

- Backend serves auth endpoints and Socket.IO on `http://localhost:4000`.
- Frontend runs at `http://localhost:5173` and proxies `/api` and `/config.js` to the backend.

 Video walkthrough: see [public/Screen Recording 2025-12-28 at 10.26.07 AM](public/Screen%20Recording%202025-12-28%20at%2010.26.07%E2%80%AFAM).
2. Run `pnpm dev` and `pnpm client` in two terminals.
3. Navigate to `http://localhost:5173`.
4. Click "Sign in with Google" → on success, a `token` httpOnly cookie is set.
5. Create a room, join it, send a message.
6. Open another browser window to join the same room and see real-time messages/users.

## Project Structure
- [src/index.ts](src/index.ts): Express + Socket.IO server, CORS, `/api` auth endpoints, `/config.js` for client ID.
- [src/auth.ts](src/auth.ts): Google ID token verification, JWT sign/verify, cookie parsing.
- [src/ChatRoomManager.ts](src/ChatRoomManager.ts): In-memory room store.
- [src/room.ts](src/room.ts): Type shape for a room.
- [public/index.html](public/index.html): Minimal static client (optional alternative to React).
- [frontend](frontend): Vite React + TS application.
  - [frontend/vite.config.ts](frontend/vite.config.ts): Proxy `/api` and `/config.js` to backend.
  - [frontend/src/App.tsx](frontend/src/App.tsx): Rooms list, join/leave, users, history, messaging.

## Socket Events
- Server → Client
  - `rooms:update`: Array of `{ name, online, messages }` for all rooms.
  - `room:users`: Array of user identifiers for a room.
  - `room:history`: `{ room, messages }` where messages follow `{ sender, content, timestamp }`.
  - `message:new`: Live messages `{ user, text, at }` broadcasted to the room.
- Client → Server
  - `room:create` (roomName)
  - `room:join` (roomName)
  - `room:leave` (roomName)
  - `message:send` ({ room, text })

## Authentication
- Frontend obtains Google ID token via Google Sign-In.
- Sends `idToken` to `/api/auth/google`.
- Server verifies it and sets a `token` httpOnly cookie (JWT), used by Socket.IO auth middleware.
- Logout clears the cookie (`/api/auth/logout`).

## Architecture Overview
- **Auth**: Google ID token → JWT in httpOnly cookie; Socket.IO middleware validates before allowing connections.
- **Rooms**: `ChatRoomManager` stores rooms in-memory. Each room aligns with `room.ts` type: `roomName`, `users: string[]`, and `messages: { sender, content, timestamp }[]`.
  - A `sessionIndex` maps `socketId → userId` so joining/leaving updates the `users` list correctly.
  - Max messages per room capped by `maxMessagesPerRoom` (default 200).
- **Transport**: Socket.IO rooms are used to isolate broadcasting to only connected clients of that room.
- **Frontend**: React app handles Google sign-in, room lifecycle, and real-time messaging with clean state management.

## What We’d Improve With More Time
- **Persistence**: Add a database (e.g., Postgres, MongoDB, or SQLite) to persist users, rooms, and messages. Support message pagination and replay.
- **Identity & Profiles**: Use stable user IDs and display names/pictures consistently; allow profile updates.
- **Authorization**: Add room-level ACLs (private rooms, invites), rate limiting, and server-side validation against abuse.
- **Production Hardening**: HTTPS, secure cookies (`secure: true`), CSRF protection for REST endpoints, and robust CORS configuration.
- **Observability**: Request/Socket logging, metrics, and error tracking.
- **Testing**:
  - Unit tests (Jest) for `ChatRoomManager` and auth.
  - E2E tests (Playwright or Cypress) covering login, room flows, and messaging.
- **Frontend UX**: Better UI/UX (state indicators, typing indicator, unread counts, message grouping, infinite scroll).
- **Build & Deploy**: Single command to build client and serve via Express, Dockerfile, CI/CD.

## Scripts
- Backend dev: `pnpm dev`
- Frontend dev: `pnpm client`
- Frontend build: `pnpm client:build`
- Frontend preview: `pnpm client:preview`

## Notes
- For Google Sign-In, ensure your OAuth client is configured with `http://localhost:5173` as an authorized JavaScript origin.
- In production, set `secure: true` on cookies and serve over HTTPS.
