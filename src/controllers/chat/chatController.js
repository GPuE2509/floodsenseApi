const User = require('../../models/User');
const Message = require('../../models/Message');
const { uploadImage } = require('../../utils/uploadCloudinary');

/**
 * GET /api/chat/users/search
 * Search users by full_name, email, or phone (excluding self, admin, and manager)
 */
exports.searchUsers = async (req, res) => {
  try {
    const { q } = req.query;
    const currentUserId = req.user ? req.user._id : null;

    // Exclude Admin and Manager roles from search
    const query = {
      role: { $nin: ['Admin', 'Manager'] }
    };
    
    // Exclude current user from search results
    if (currentUserId) {
      query._id = { $ne: currentUserId };
    }

    if (q && q.trim()) {
      const searchRegex = new RegExp(q.trim(), 'i');
      query.$or = [
        { full_name: searchRegex },
        { email: searchRegex },
        { phone: searchRegex }
      ];
    }

    // Limit results to 15 users for performance
    const users = await User.find(query)
      .select('full_name email phone role status avatar_url')
      .limit(15);

    // Format response to match frontend expectations
    const formatted = users.map(u => ({
      id: u._id.toString(),
      name: u.full_name || 'Unnamed',
      email: u.email,
      phone: u.phone || 'N/A',
      role: u.role || 'Member',
      status: u.status || 'Active',
      avatar_url: u.avatar_url || '',
      online: Math.random() > 0.5 // Mock online status for display
    }));

    return res.status(200).json({
      success: true,
      data: formatted
    });
  } catch (error) {
    console.error('Error in searchUsers chat controller:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while searching users.'
    });
  }
};

/**
 * GET /api/chat/volunteers
 * Get all users with Volunteer role (excluding self)
 */
exports.getVolunteers = async (req, res) => {
  try {
    const currentUserId = req.user ? req.user._id : null;

    const query = { role: 'Volunteer' };
    if (currentUserId) {
      query._id = { $ne: currentUserId };
    }

    const volunteers = await User.find(query).select('full_name email role avatar_url');

    const formatted = volunteers.map(v => ({
      id: v._id.toString(),
      name: v.full_name || 'Unnamed',
      email: v.email,
      role: v.role,
      avatar_url: v.avatar_url || '',
      online: Math.random() > 0.3 // Mock online status
    }));

    return res.status(200).json({
      success: true,
      data: formatted
    });
  } catch (error) {
    console.error('Error in getVolunteers chat controller:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching volunteers.'
    });
  }
};

/**
 * GET /api/chat/conversations
 * Fetch recent active chat threads for the current user
 */
exports.getConversations = async (req, res) => {
  try {
    const currentUserId = req.user._id;

    // Fetch recent messages involving the user or group messages
    const messages = await Message.find({
      $or: [
        { sender_id: currentUserId },
        { receiver_id: currentUserId },
        { group_id: { $exists: true, $ne: null }, members: currentUserId }
      ]
    })
    .sort({ sent_at: -1 })
    .limit(300);

    const threads = new Map();

    for (const msg of messages) {
      let threadId;
      let isGroup = false;

      if (msg.group_id) {
        threadId = msg.group_id;
        isGroup = true;
      } else {
        const senderIdStr = msg.sender_id.toString();
        const receiverIdStr = msg.receiver_id ? msg.receiver_id.toString() : '';
        threadId = senderIdStr === currentUserId.toString() ? receiverIdStr : senderIdStr;
      }

      if (!threadId) continue;

      if (!threads.has(threadId)) {
        threads.set(threadId, {
          id: threadId,
          isGroup,
          lastMsg: msg.message_text,
          time: new Date(msg.sent_at).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' }),
          timestamp: msg.sent_at
        });
      }
    }

    const threadList = Array.from(threads.values());
    const userIds = threadList.filter(t => !t.isGroup).map(t => t.id);

    const users = await User.find({ _id: { $in: userIds } })
      .select('full_name avatar_url role phone');

    const userMap = new Map(users.map(u => [u._id.toString(), u]));

    const formatted = await Promise.all(threadList.map(async t => {
      if (t.isGroup) {
        let name = "Group Chat";
        if (t.id.includes("Rescue") || t.id.startsWith("group-volunteer")) {
          name = "Volunteer Group";
        } else if (t.id.startsWith("group-")) {
          name = `Rescue Group (${t.id.substring(6, 11)})`;
        }
        return {
          id: t.id,
          name,
          role: "Group chat",
          phone: '',
          avatar: name.substring(0, 2).toUpperCase(),
          avatar_url: '',
          color: 'var(--red-400)',
          lastMsg: t.lastMsg,
          time: t.time,
          unread: 0,
          online: false
        };
      } else {
        const u = userMap.get(t.id);
        const name = u ? u.full_name : 'Deleted User';
        const unreadCount = await Message.countDocuments({
          sender_id: t.id,
          receiver_id: currentUserId,
          is_read: false
        });
        return {
          id: t.id,
          name,
          role: u ? u.role : 'Member',
          phone: u ? (u.phone || '') : '',
          avatar: name.substring(0, 2).toUpperCase(),
          avatar_url: u ? (u.avatar_url || '') : '',
          color: u && u.role === 'Volunteer' ? 'var(--orange-400)' : 'var(--cyan-400)',
          lastMsg: t.lastMsg,
          time: t.time,
          unread: unreadCount,
          online: Math.random() > 0.5
        };
      }
    }));

    formatted.sort((a, b) => {
      const tA = threads.get(a.id).timestamp;
      const tB = threads.get(b.id).timestamp;
      return tB - tA;
    });

    return res.status(200).json({
      success: true,
      data: formatted
    });
  } catch (error) {
    console.error('Error in getConversations chat controller:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching conversations.'
    });
  }
};

/**
 * GET /api/chat/history
 * Fetch message history for a direct message or group thread
 */
exports.getChatHistory = async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const { targetId } = req.query;

    if (!targetId) {
      return res.status(400).json({
        success: false,
        message: 'targetId query parameter is required.'
      });
    }

    const isGroup = targetId.startsWith('g-') || targetId.startsWith('group-') || targetId.includes('Rescue');

    let query;
    if (isGroup) {
      query = { group_id: targetId };
    } else {
      query = {
        $or: [
          { sender_id: currentUserId, receiver_id: targetId },
          { sender_id: targetId, receiver_id: currentUserId }
        ]
      };
      // Mark messages sent by targetId to currentUserId as read
      await Message.updateMany(
        { sender_id: targetId, receiver_id: currentUserId, is_read: false },
        { $set: { is_read: true } }
      );
    }

    const messages = await Message.find(query)
      .populate('sender_id', 'full_name role avatar_url')
      .sort({ sent_at: 1 })
      .limit(100);

    const formatted = messages.map(msg => {
      const isMe = msg.sender_id._id.toString() === currentUserId.toString();
      return {
        id: msg._id.toString(),
        from: isMe ? 'me' : 'them',
        senderName: msg.sender_id.full_name || 'Unnamed',
        senderRole: msg.sender_id.role || 'Member',
        senderAvatarUrl: msg.sender_id.avatar_url || '',
        text: msg.message_text,
        time: new Date(msg.sent_at).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' })
      };
    });

    return res.status(200).json({
      success: true,
      data: formatted
    });
  } catch (error) {
    console.error('Error in getChatHistory chat controller:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching chat history.'
    });
  }
};

/**
 * POST /api/chat/read
 * Mark all messages from a target user to the current user as read
 */
exports.markAsRead = async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const { targetId } = req.body;

    if (!targetId) {
      return res.status(400).json({
        success: false,
        message: 'targetId is required.'
      });
    }

    await Message.updateMany(
      { sender_id: targetId, receiver_id: currentUserId, is_read: false },
      { $set: { is_read: true } }
    );

    return res.status(200).json({
      success: true,
      message: 'Messages marked as read successfully.'
    });
  } catch (error) {
    console.error('Error in markAsRead chat controller:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while marking messages as read.'
    });
  }
};

/**
 * POST /api/chat/send
 * Send a direct or group message and persist to database
 */
exports.sendMessage = async (req, res) => {
  try {
    const senderId = req.user._id;
    const { targetId, text } = req.body;

    if (!targetId || !text) {
      return res.status(400).json({
        success: false,
        message: 'targetId and text are required.'
      });
    }

    const isGroup = targetId.startsWith('g-') || targetId.startsWith('group-') || targetId.includes('Rescue');
    const messageData = {
      sender_id: senderId,
      message_text: text,
      sent_at: new Date()
    };
    if (isGroup) {
      messageData.group_id = targetId;
    } else {
      messageData.receiver_id = targetId;
    }

    const savedMsg = await Message.create(messageData);
    await savedMsg.populate('sender_id', 'full_name role avatar_url');

    return res.status(200).json({
      success: true,
      data: {
        id: savedMsg._id.toString(),
        from: 'me',
        senderName: savedMsg.sender_id.full_name || 'Me',
        senderRole: savedMsg.sender_id.role || 'Member',
        senderAvatarUrl: savedMsg.sender_id.avatar_url || '',
        text: savedMsg.message_text,
        time: new Date(savedMsg.sent_at).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' })
      }
    });
  } catch (error) {
    console.error('Error in sendMessage chat controller:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while sending message.'
    });
  }
};

/**
 * POST /api/chat/upload-image
 * Upload an image for the chat and return its Cloudinary URL
 */
exports.uploadChatImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided.'
      });
    }

    const folder = 'smart-flood-traffic/chat';
    const result = await uploadImage(req.file.buffer, folder);

    return res.status(200).json({
      success: true,
      url: result.secure_url
    });
  } catch (error) {
    console.error('Error in uploadChatImage:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error while uploading image.'
    });
  }
};
