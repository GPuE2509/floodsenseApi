const mongoose = require('mongoose');
const { Schema } = mongoose;

const postReportSchema = new Schema({
  post_id: { type: Schema.Types.ObjectId, ref: 'ForumPost', required: [true, 'Post ID is required'] },
  reporter_id: { type: Schema.Types.ObjectId, ref: 'User', required: [true, 'Reporter ID is required'] },
  reason: { 
    type: String, 
    enum: {
      values: ['Spam / Advertising', 'Misinformation / Fake News', 'Inappropriate Content', 'Harassment / Hate Speech', 'Unrelated to Rescue / Traffic', 'Scam / Fraud', 'Other'],
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

// Ensure a user can only report a specific post once
postReportSchema.index({ post_id: 1, reporter_id: 1 }, { unique: true });

module.exports = mongoose.model('PostReport', postReportSchema);
