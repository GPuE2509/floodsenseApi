const mongoose = require('mongoose');
const { Schema } = mongoose;

const workshopReviewSchema = new Schema({
  workshop_id: { type: Schema.Types.ObjectId, ref: 'Workshop', required: [true, 'Workshop ID is required'] },
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: [true, 'User ID is required'] },
  parent_id: { type: Schema.Types.ObjectId, ref: 'WorkshopReview' },
  rating: { 
    type: Number,
    min: [1, 'Minimum rating score is 1'],
    max: [5, 'Maximum rating score is 5']
  },
  content: { 
    type: String,
    trim: true
  },
  images: [{
    type: String
  }],
  owner_response: {
    content: { type: String, trim: true },
    images: [{ type: String }],
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
  },
  replies: [{
    user_id: { type: Schema.Types.ObjectId, ref: 'User' },
    content: { type: String, trim: true },
    images: [{ type: String }],
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
  }],
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// Ensure one review per user per workshop (prevents duplicates under race conditions)
workshopReviewSchema.index({ workshop_id: 1, user_id: 1 }, { unique: true });
// Optimize fetching and sorting reviews by workshop
workshopReviewSchema.index({ workshop_id: 1, created_at: -1 });

module.exports = mongoose.model('WorkshopReview', workshopReviewSchema);
