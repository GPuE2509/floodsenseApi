const clients = new Map();
let wss = null;

module.exports = {
  setWss: (serverInstance) => {
    wss = serverInstance;
  },
  getWss: () => wss,
  clients,
  sendToUser: (userId, message) => {
    if (!userId) return false;
    const ws = clients.get(userId.toString());
    if (ws && ws.readyState === 1) { // 1 is WebSocket.OPEN
      try {
        ws.send(JSON.stringify(message));
        return true;
      } catch (err) {
        console.error(`Failed to send message to user ${userId} over WebSocket:`, err);
      }
    }
    return false;
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
