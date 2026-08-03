const User = require('../../models/User');

exports.getUserPreferences = async (user) => {
  const prefs = user.notification_preferences || {};
  return {
    masterPush: prefs.masterPush !== undefined ? prefs.masterPush : true,
    flood: prefs.flood !== undefined ? prefs.flood : true,
    sos: prefs.sos !== undefined ? prefs.sos : true,
    community: prefs.community !== undefined ? prefs.community : true,
    pushChannel: prefs.pushChannel !== undefined ? prefs.pushChannel : true,
    emailChannel: prefs.emailChannel !== undefined ? prefs.emailChannel : false
  };
};

exports.updateUserPreferences = async (userId, preferencesData) => {
  const user = await User.findById(userId);
  if (!user) {
    const error = new Error('User not found');
    error.status = 404;
    throw error;
  }

  const { masterPush, flood, sos, community, pushChannel, emailChannel } = preferencesData;

  user.notification_preferences = {
    masterPush: masterPush !== undefined ? masterPush : true,
    flood: flood !== undefined ? flood : true,
    sos: sos !== undefined ? sos : true,
    community: community !== undefined ? community : true,
    pushChannel: pushChannel !== undefined ? pushChannel : true,
    emailChannel: emailChannel !== undefined ? emailChannel : false
  };

  await user.save();
  return user.notification_preferences;
};

exports.markAsRead = async (notificationId, user) => {
  const Notification = require('../../models/Notification');
  const notif = await Notification.findById(notificationId);
  if (!notif) {
    const error = new Error('Notification not found');
    error.status = 404;
    throw error;
  }
  
  const isRecipient = notif.recipient_id && notif.recipient_id.toString() === user._id.toString();
  const isRoleMatch = notif.recipient_role && notif.recipient_role === user.role;
  if (!isRecipient && !isRoleMatch) {
    const error = new Error('Unauthorized');
    error.status = 403;
    throw error;
  }

  notif.is_read = true;
  await notif.save();
  return notif;
};

exports.markAllRead = async (user) => {
  const Notification = require('../../models/Notification');
  await Notification.updateMany(
    {
      $or: [
        { recipient_id: user._id },
        { recipient_role: user.role }
      ],
      is_read: false
    },
    { is_read: true }
  );
};

exports.dispatchSystemWide = async (sender, title, body, type = 'Admin_Announcement') => {
  const Notification = require('../../models/Notification');
  const wsHelper = require('../../utils/wsHelper');
  
  // Find all active users except the sender
  const users = await User.find({ _id: { $ne: sender._id }, status: 'Active' }, '_id');
  
  if (users.length === 0) return 0;

  const notificationsToInsert = users.map(u => ({
    recipient_id: u._id,
    title,
    body,
    type: type,
    metadata: {
      sender_name: sender.full_name || 'System Admin',
      avatar_url: sender.avatar_url || '',
      web_url: '/notifications',
      mobile_route: '/notifications'
    }
  }));

  // Bulk insert notifications
  const insertedDocs = await Notification.insertMany(notificationsToInsert);

  // Manual WebSocket broadcast since insertMany bypasses post-save hook
  try {
    insertedDocs.forEach(doc => {
      wsHelper.sendToUser(doc.recipient_id, {
        type: 'notification',
        notification: {
          _id: doc._id,
          recipient_id: doc.recipient_id,
          title: doc.title,
          body: doc.body,
          type: doc.type,
          metadata: doc.metadata,
          is_read: doc.is_read,
          created_at: doc.created_at || new Date()
        }
      });
    });
  } catch (err) {
    console.error('Error broadcasting system notification via WebSocket:', err);
  }

  return users.length;
};
