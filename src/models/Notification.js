const mongoose = require('mongoose');
const { Schema } = mongoose;

const notificationSchema = new Schema({
  recipient_id: { type: Schema.Types.ObjectId, ref: 'User' },
  recipient_role: { 
    type: String, 
    enum: {
      values: ['Admin', 'Manager', 'User', 'Volunteer', 'Workshop'],
      message: 'Invalid recipient role'
    }
  },
  title: { 
    type: String, 
    maxlength: [255, 'Title cannot exceed 255 characters'],
    trim: true
  },
  body: { 
    type: String,
    trim: true
  },
  type: { 
    type: String, 
    enum: {
      values: [
        'New_Comment_On_Post', 'New_Reply_On_Comment', 'New_Reply_On_Review', 
        'Admin_Announcement', 'Flood_In_Warning_Zone', 'Emergency_SOS_Nearby', 
        'Workshop_Invite', 'System_Alert',
        'New_Reaction_On_Post', 'Post_Approved', 'Post_Rejected', 'Emergency_SOS_Contact'
      ],
      message: 'Invalid notification type'
    }
  },
  reference_id: { type: Schema.Types.ObjectId },
  reference_type: { 
    type: String, 
    enum: {
      values: ['forum_posts', 'post_comments', 'workshop_reviews', 'incident_reports', 'rescue_sessions'],
      message: 'Invalid reference type'
    }
  },
  
  metadata: {
    sender_name: { 
      type: String, 
      maxlength: [100, 'Sender name cannot exceed 100 characters'],
      trim: true
    },
    avatar_url: { 
      type: String, 
      maxlength: [255, 'Avatar URL cannot exceed 255 characters'],
      match: [/^https?:\/\/.+|^$/, 'Avatar URL must be a valid URL or empty']
    },
    flood_depth_mm: { 
      type: Number,
      min: [0, 'Water depth cannot be negative']
    },
    web_url: { 
      type: String, 
      maxlength: [255, 'Web URL cannot exceed 255 characters']
    },
    mobile_route: {
      type: String,
      maxlength: [255, 'Mobile route cannot exceed 255 characters']
    },
    app_screen: { 
      type: String, 
      maxlength: [100, 'Screen name cannot exceed 100 characters']
    },
    app_params: { type: Schema.Types.Mixed }
  },
  
  is_read: { type: Boolean, default: false },
  is_push_sent: { type: Boolean, default: false }
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });

notificationSchema.pre('save', function (next) {
  if (!this.metadata) {
    this.metadata = {};
  }
  if (!this.metadata.mobile_route) {
    const webUrl = this.metadata.web_url || '';
    const refType = this.reference_type || '';
    
    // Prioritize checking webUrl targets to ensure exact destination matches (e.g. IoT alerts to Dashboard)
    if (webUrl.includes('/dashboard') || webUrl.includes('/map')) {
      this.metadata.mobile_route = '/dashboard';
    } else if (webUrl.includes('/profile')) {
      this.metadata.mobile_route = '/profile';
    } else if (refType === 'incident_reports' || webUrl.includes('/reports')) {
      this.metadata.mobile_route = '/reports';
    } else if (refType === 'rescue_sessions' || webUrl.includes('/sos')) {
      this.metadata.mobile_route = '/sos';
    } else if (refType === 'forum_posts' || refType === 'post_comments' || webUrl.includes('/forum')) {
      this.metadata.mobile_route = '/forum';
    } else {
      this.metadata.mobile_route = '/notifications';
    }
  }
  next();
});


notificationSchema.post('save', function (doc) {
  try {
    const wsHelper = require('../utils/wsHelper');
    if (doc.recipient_id) {
      wsHelper.sendToUser(doc.recipient_id, {
        type: 'notification',
        notification: {
          _id: doc._id,
          recipient_id: doc.recipient_id,
          title: doc.title,
          body: doc.body,
          type: doc.type,
          reference_id: doc.reference_id,
          reference_type: doc.reference_type,
          metadata: doc.metadata,
          is_read: doc.is_read,
          created_at: doc.created_at || new Date()
        }
      });
    }
  } catch (err) {
    console.error('Error in Notification post-save WebSocket hook:', err);
  }
});

module.exports = mongoose.model('Notification', notificationSchema);