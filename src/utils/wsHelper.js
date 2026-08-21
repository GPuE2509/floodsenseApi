const clients = new Map(); // userId -> Set of sockets
let wss = null;

module.exports = {
  setWss: (serverInstance) => {
    wss = serverInstance;
  },
  getWss: () => wss,
  clients,
  addClient: (userId, socket) => {
    if (!userId) return;
    const uid = userId.toString();
    if (!clients.has(uid)) {
      clients.set(uid, new Set());
    }
    clients.get(uid).add(socket);
  },
  removeClient: (userId, socket) => {
    if (!userId) return;
    const uid = userId.toString();
    if (clients.has(uid)) {
      const sockets = clients.get(uid);
      sockets.delete(socket);
      if (sockets.size === 0) {
        clients.delete(uid);
      }
    }
  },
  sendToUser: (userId, message) => {
    if (!userId) return false;
    const uid = userId.toString();
    const sockets = clients.get(uid);
    let success = false;
    if (sockets && sockets.size > 0) {
      sockets.forEach(ws => {
        if (ws.readyState === 1) { // WebSocket.OPEN
          try {
            ws.send(JSON.stringify(message));
            success = true;
          } catch (err) {
            console.error(`Failed to send message to user ${userId} over WebSocket:`, err);
          }
        }
      });
    }
    return success;
  },
  broadcast: (message) => {
    if (wss) {
      wss.clients.forEach(client => {
        if (client.readyState === 1) {
          try {
            client.send(JSON.stringify(message));
          } catch (err) {
            console.error('Failed to broadcast message over WebSocket:', err);
          }
        }
      });
    }
  }
};
