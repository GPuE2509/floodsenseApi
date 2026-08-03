require("dotenv").config();

const http = require("http");
const WebSocket = require("ws");
require("./jobs/cronJobs");
const app = require("./app");
const connectDB = require("./config/database");
const Message = require("./models/Message");
const wsHelper = require("./utils/wsHelper");

connectDB();

const PORT = process.env.PORT || 5000;

// Create HTTP server wrapping Express app
const server = http.createServer(app);

// Initialize WebSocket server on top of HTTP server
const wss = new WebSocket.Server({ server });
wsHelper.setWss(wss);
app.set('wss', wss);

wss.on('connection', (ws) => {
  console.log('New WebSocket client connected');

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'register') {
        ws.userId = data.userId;
        ws.userName = data.userName;
        ws.role = data.role;
        ws.avatarUrl = data.avatarUrl || '';
        wsHelper.clients.set(data.userId, ws);
        console.log(`Registered WebSocket user: ${data.userName} (${data.userId})`);
      } else if (data.type === 'chat') {
        const { senderId, senderName, senderRole, targetId, text, time, members } = data;
        
        // Save chat message to database
        const isGroup = targetId.startsWith('g-') || targetId.startsWith('group-') || targetId.includes('Rescue');
        const messageData = {
          sender_id: senderId,
          message_text: text,
          sent_at: new Date()
        };
        if (isGroup) {
          messageData.group_id = targetId;
          if (members && Array.isArray(members)) {
            messageData.members = members;
          }
        } else {
          messageData.receiver_id = targetId;
        }

        try {
          await Message.create(messageData);
        } catch (dbErr) {
          console.error('Failed to save message to database:', dbErr);
        }

        // Handle Group Broadcast: check if targetId matches a group pattern (like g- or group- or contains Rescue)
        if (isGroup) {
          console.log(`Group chat message in ${targetId} from ${senderName}: ${text}`);
          
          let groupMembers = members;
          if (!groupMembers) {
            try {
              const creationMsg = await Message.findOne({ group_id: targetId, members: { $exists: true, $not: { $size: 0 } } });
              if (creationMsg && creationMsg.members) {
                groupMembers = creationMsg.members.map(id => id.toString());
              }
            } catch (err) {
              console.error('Failed to fetch group members for broadcast:', err);
            }
          }

          wsHelper.clients.forEach((client, clientUserId) => {
            const isMember = !groupMembers || groupMembers.includes(clientUserId);
            if (isMember && clientUserId !== senderId && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'chat',
                senderId,
                senderName,
                senderRole,
                senderAvatarUrl: ws.avatarUrl || '',
                groupId: targetId,
                text,
                time
              }));
            }
          });
        } else {
          // Handle Direct Message
          console.log(`Direct message from ${senderName} to ${targetId}: ${text}`);
          const recipientSocket = wsHelper.clients.get(targetId);
          if (recipientSocket && recipientSocket.readyState === WebSocket.OPEN) {
            recipientSocket.send(JSON.stringify({
              type: 'chat',
              senderId,
              senderName,
              senderRole,
              senderAvatarUrl: ws.avatarUrl || '',
              text,
              time
            }));
          }
        }
      }
    } catch (err) {
      console.error('Error handling WebSocket message:', err);
    }
  });

  ws.on('close', () => {
    if (ws.userId) {
      wsHelper.clients.delete(ws.userId);
      console.log(`Removed WebSocket client registration: ${ws.userName} (${ws.userId})`);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});