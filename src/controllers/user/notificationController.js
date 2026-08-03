const Notification = require('../../models/Notification');
const notificationService = require('../../services/user/notificationService');

exports.getNotifications = async (req, res) => {
  try {
    const userId = req.user._id;
    const userRole = req.user.role;
    const notifications = await Notification.find({
      $or: [
        { recipient_id: userId },
        { recipient_role: userRole }
      ]
    })
      .sort({ created_at: -1 })
      .exec();

    return res.status(200).json({
      success: true,
      data: notifications
    });
  } catch (error) {
    console.error('Error in getNotifications controller:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching notifications.'
    });
  }
};

exports.getPreferences = async (req, res) => {
  try {
    const preferences = await notificationService.getUserPreferences(req.user);
    return res.status(200).json({ success: true, data: preferences });
  } catch (error) {
    console.error('Error in getPreferences controller:', error);
    return res.status(500).json({ success: false, message: 'Server error while fetching notification preferences.' });
  }
};

exports.updatePreferences = async (req, res) => {
  try {
    const preferences = await notificationService.updateUserPreferences(req.user._id, req.body);
    return res.status(200).json({ success: true, message: 'Notification preferences updated successfully.', data: preferences });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    console.error('Error in updatePreferences controller:', error);
    return res.status(500).json({ success: false, message: 'Server error while updating notification preferences.' });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const notification = await notificationService.markAsRead(id, req.user);
    return res.status(200).json({ success: true, message: 'Notification marked as read.', data: notification });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    console.error('Error in markAsRead controller:', error);
    return res.status(500).json({ success: false, message: 'Server error while marking notification as read.' });
  }
};

exports.markAllRead = async (req, res) => {
  try {
    await notificationService.markAllRead(req.user);
    return res.status(200).json({ success: true, message: 'All notifications marked as read.' });
  } catch (error) {
    console.error('Error in markAllRead controller:', error);
    return res.status(500).json({ success: false, message: 'Server error while marking all notifications as read.' });
  }
};

exports.dispatchSystemNotification = async (req, res) => {
  try {
    const { title, body, type } = req.body;
    
    const finalTitle = typeof title === 'string' ? title.replace(/\s+/g, ' ').trim() : '';
    const finalBody = typeof body === 'string' ? body.replace(/\s+/g, ' ').trim() : '';

    if (!finalTitle || !finalBody) {
      return res.status(400).json({ success: false, message: 'Title and body are required.' });
    }

    if (finalTitle.length > 100) {
      return res.status(400).json({ success: false, message: 'Title exceeds the maximum length of 100 characters.' });
    }

    if (finalBody.length > 500) {
      return res.status(400).json({ success: false, message: 'Message exceeds the maximum length of 500 characters.' });
    }
    
    const count = await notificationService.dispatchSystemWide(req.user, finalTitle, finalBody, type);
    
    return res.status(200).json({ 
      success: true, 
      message: 'System notification dispatched successfully.',
      count
    });
  } catch (error) {
    console.error('Error in dispatchSystemNotification controller:', error);
    return res.status(500).json({ success: false, message: 'Server error while dispatching system notification.' });
  }
};

exports.getPublicBroadcasts = async (req, res) => {
  try {
    const broadcasts = await Notification.aggregate([
      { 
        $match: { 
          type: { $in: ['Admin_Announcement', 'System_Alert'] },
          "metadata.sender_name": { $exists: true, $ne: "" },
          "metadata.web_url": "/notifications"
        } 
      },
      { 
        $group: {
          _id: { title: "$title", body: "$body", type: "$type" },
          created_at: { $max: "$created_at" },
          sender_name: { $first: "$metadata.sender_name" }
        }
      },
      { $sort: { created_at: -1 } },
      { $limit: 5 },
      {
        $project: {
          _id: 0,
          title: "$_id.title",
          body: "$_id.body",
          type: "$_id.type",
          created_at: 1,
          sender_name: 1
        }
      }
    ]);

    return res.status(200).json({ success: true, data: broadcasts });
  } catch (error) {
    console.error('Error in getPublicBroadcasts controller:', error);
    return res.status(500).json({ success: false, message: 'Server error while fetching public broadcasts.' });
  }
};
