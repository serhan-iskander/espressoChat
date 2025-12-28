
export class ChatRoomManager {
  constructor(maxMessagesPerRoom = 200) {
    this.rooms = [];
    this.maxMessagesPerRoom = maxMessagesPerRoom;
    // Internal index: roomName -> Map(socketId -> userId)
    this.sessionIndex = new Map();
  }

  listRooms() {
    return this.rooms.map(r => ({
      name: r.roomName,
      online: r.users.length,
      messages: r.messages.length,
    }));
  }

  ensureRoom(name) {
    let r = this.rooms.find(r => r.roomName === name);
    if (!r) {
      r = { roomName: name, users: [], messages: [] };
      this.rooms.push(r);
    }
    if (!this.sessionIndex.has(name)) {
      this.sessionIndex.set(name, new Map());
    }
    return r;
  }

  addUser(roomName, socketId, user) {
    const r = this.ensureRoom(roomName);
    const userId = user?.id ?? user?.email ?? user?.name ?? String(socketId);
    const idx = this.sessionIndex.get(roomName);
    idx.set(socketId, userId);
    if (!r.users.includes(userId)) {
      r.users.push(userId);
    }
    return r.users;
  }

  removeUser(roomName, socketId) {
    const roomIdx = this.rooms.findIndex(r => r.roomName === roomName);
    if (roomIdx === -1) return [];
    const r = this.rooms[roomIdx];
    const idx = this.sessionIndex.get(roomName);
    const userId = idx?.get(socketId);
    if (userId) {
      const arrIdx = r.users.indexOf(userId);
      if (arrIdx !== -1) r.users.splice(arrIdx, 1);
      idx.delete(socketId);
    }
    if (r.users.length === 0 && r.messages.length === 0) {
      this.rooms.splice(roomIdx, 1); // cleanup empty rooms
      this.sessionIndex.delete(roomName);
      return [];
    }
    return r.users;
  }

  getUsers(roomName) {
    const r = this.rooms.find(r => r.roomName === roomName);
    if (!r) return [];
    return r.users;
  }

  addMessage(roomName, message) {
    const r = this.ensureRoom(roomName);
    const m = {
      sender: message?.user?.id ?? message?.user?.email ?? message?.user?.name ?? 'unknown',
      content: message?.text ?? String(message),
      timestamp: message?.at ?? Date.now(),
    };
    r.messages.push(m);
    if (this.maxMessagesPerRoom && r.messages.length > this.maxMessagesPerRoom) {
      r.messages.shift();
    }
    return m;
  }

  getMessages(roomName) {
    const r = this.rooms.find(r => r.roomName === roomName);
    return r ? r.messages : [];
  }
}
