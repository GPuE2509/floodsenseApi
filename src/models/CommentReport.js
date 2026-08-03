const mongoose = require('mongoose');
const { Schema } = mongoose;

const commentReportSchema = new Schema({
  comment_id: { type: Schema.Types.ObjectId, ref: 'PostComment', required: [true, 'Comment ID is required'] },
  reporter_id: { type: Schema.Types.ObjectId, ref: 'User', required: [true, 'Reporter ID is required'] },
  reason: { 
    type: String, 
    enum: {
      values: ['Spam', 'Harassment', 'Hate Speech', 'Sensitive Content', 'Misinformation', 'Privacy Violation', 'Other'],
      message: 'Invalid report reason'
    },
    required: [true, 'Report reason is required']
  },
  details: {
    type: String,
    trim: true,
    maxlength: [500, 'Details cannot exceed 500 characters']
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// Ensure a user can only report a specific comment once
commentReportSchema.index({ comment_id: 1, reporter_id: 1 }, { unique: true });

module.exports = mongoose.model('CommentReport', commentReportSchema);
