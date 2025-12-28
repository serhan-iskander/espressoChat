import React, { useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

type RoomSummary = { name: string; online: number; messages: number };
type RoomHistoryMsg = { sender: string; content: string; timestamp: number };

type UserInfo = { id?: string; email?: string; name?: string; picture?: string } | null;

export default function App() {
    const [user, setUser] = useState<UserInfo>(null);
    const [socket, setSocket] = useState<Socket | null>(null);
    const [rooms, setRooms] = useState<RoomSummary[]>([]);
    const [currentRoom, setCurrentRoom] = useState<string | null>(null);
    const [users, setUsers] = useState<string[]>([]);
    const [messages, setMessages] = useState<RoomHistoryMsg[]>([]);
    const [status, setStatus] = useState<string>('');
    const inputRef = useRef<HTMLInputElement>(null);
    const newRoomRef = useRef<HTMLInputElement>(null);

    const connected = !!socket;

    const clientId = useMemo(() =>(window as any).__GOOGLE_CLIENT_ID__ || '', []);
    const gsiRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        (window as any).onGoogleCredential = (resp: any) => {
            const idToken = resp.credential;
            fetch('/api/auth/google', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ idToken }),
            })
                .then((r) => r.json())
                .then((data) => {
                    if (data.error) { setStatus('Auth failed'); return; }
                    setUser(data.user);
                    setStatus('Signed in');
                })
                .catch((e) => setStatus(String(e)));
        };
    }, []);

    useEffect(() => {
        if (user && !socket) {
            const s = io('http://localhost:4000', { withCredentials: true });
            s.on('connect', () => setStatus('Socket connected'));
            s.on('connect_error', (err) => {
                setStatus(`Socket error: ${err?.message || err}`);
            });
            s.on('rooms:update', (list: RoomSummary[]) => setRooms(list));
            s.on('room:users', (list: string[]) => setUsers(list));
            s.on('room:history', (payload: { room: string; messages: RoomHistoryMsg[] }) => {
                // Merge history with any already appended live messages to avoid overwriting
                setCurrentRoom(payload.room);
                setMessages((prev) => {
                    const base = payload.messages || [];
                    const lastTs = base.reduce((max, m) => Math.max(max, m.timestamp || 0), 0);
                    const tail = prev.filter((m) => (m.timestamp || 0) > lastTs);
                    return [...base, ...tail];
                });
            });
            s.on('message:new', (msg: { user: any; text: string; at: number }) => {
                // append live messages; not part of history array
                const sender = msg.user?.name || msg.user?.email || msg.user?.id || 'unknown';
                const m: RoomHistoryMsg = { sender, content: msg.text, timestamp: msg.at };
                setMessages((prev) => [...prev, m]);
            });
            setSocket(s);
        }
    }, [user, socket, currentRoom]);

    // Initialize Google Sign-In button (handles async script load)
    useEffect(() => {
        let initialized = false;
        const tryInit = () => {
            if (initialized || user) return;
            const google = (window as any).google;
            if (clientId && google?.accounts?.id && gsiRef.current) {
                try {
                    google.accounts.id.initialize({ client_id: clientId, callback: (window as any).onGoogleCredential, auto_select: false });
                    gsiRef.current.innerHTML = '';
                    google.accounts.id.renderButton(gsiRef.current, { theme: 'outline', size: 'large' });
                    setStatus('Ready to sign in');
                    initialized = true;
                } catch (e) {
                    // ignore
                }
            } else if (!clientId) {
                setStatus('Missing GOOGLE_CLIENT_ID');
            }
        };
        const timer = setInterval(tryInit, 300);
        tryInit();
        return () => clearInterval(timer);
    }, [user, clientId]);

    const joinRoom = (name: string) => {
        if (!socket) return;
        socket.emit('room:join', name, () => {
            setCurrentRoom(name);
            // Do not clear messages here; let room:history handler populate them
        });
    };

    const leaveRoom = (name: string) => {
        if (!socket) return;
        socket.emit('room:leave', name, () => {
            setCurrentRoom(null);
            setUsers([]);
            setMessages([]);
        });
    };

    const createRoom = () => {
        const name = newRoomRef.current?.value.trim();
        if (!name || !socket) return;
        socket.emit('room:create', name);
        newRoomRef.current!.value = '';
    };

    const sendMessage = (e: React.FormEvent) => {
        e.preventDefault();
        const text = inputRef.current?.value.trim();
        if (!text || !currentRoom || !socket) return;
        socket.emit('message:send', { room: currentRoom, text }, () => {
            inputRef.current!.value = '';
        });
    };

    const logout = () => {
        fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).then(() => {
            setUser(null);
            setStatus('Logged out');
            socket?.disconnect();
            setSocket(null);
            setCurrentRoom(null);
            setUsers([]);
            setMessages([]);
        });
    };

    return (
        <div style={{ fontFamily: 'system-ui, sans-serif' }}>
            <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderBottom: '1px solid #eee' }}>
                <h3>Espresso Chat</h3>
                <span>{status}</span>
                {user ? (
                    <>
                        <img src={user.picture} alt="avatar" width={32} height={32} style={{ borderRadius: '50%' }} />
                        <span>{user.name || user.email}</span>
                        <button onClick={logout}>Logout</button>
                    </>
                ) : (
                    <div>
                        <div ref={gsiRef} />
                        {!clientId && <span style={{ color: 'tomato' }}>Set GOOGLE_CLIENT_ID in .env</span>}
                    </div>
                )}
            </header>

            <main style={{ display: 'flex', height: 'calc(100vh - 56px)' }}>
                <aside style={{ width: 300, borderRight: '1px solid #eee', padding: 12, overflow: 'auto' }}>
                    <h4>Rooms</h4>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <input ref={newRoomRef} type="text" placeholder="New room name" />
                        <button onClick={createRoom} disabled={!connected}>Create</button>
                    </div>
                    <div>
                        {rooms.map((r) => (
                            <div key={r.name} style={{ display: 'flex', justifyContent: 'space-between', margin: '6px 0' }}>
                                <span>{r.name} · {r.online} online · {r.messages} msgs</span>
                                {currentRoom === r.name ? (
                                    <button onClick={() => leaveRoom(r.name)}>Leave</button>
                                ) : (
                                    <button onClick={() => joinRoom(r.name)} disabled={!connected}>Join</button>
                                )}
                            </div>
                        ))}
                    </div>
                </aside>
                <section style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: 8, fontSize: 12, color: '#555' }}>Online: {users.join(', ')}</div>
                    <div style={{ flex: 1, padding: 12, overflow: 'auto' }}>
                        {messages.map((m, idx) => (
                            <div key={idx} style={{ margin: '6px 0' }}>
                                <strong>{m.sender}</strong> <span>{m.content}</span> <span style={{ color: '#999', fontSize: 12 }}>{new Date(m.timestamp).toLocaleTimeString()}</span>
                            </div>
                        ))}
                    </div>
                    <form onSubmit={sendMessage} style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid #eee' }}>
                        <input ref={inputRef} type="text" placeholder="Type a message" style={{ flex: 1 }} />
                        <button type="submit" disabled={!currentRoom || !connected}>Send</button>
                    </form>
                </section>
            </main>
        </div>
    );
}
