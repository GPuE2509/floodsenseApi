const mongoose = require('mongoose');
const { Schema } = mongoose;

const forumPostSchema = new Schema({
  author_id: { type: Schema.Types.ObjectId, ref: 'User', required: [true, 'Post author is required'] },
  title: { 
    type: String, 
    maxlength: [255, 'Title cannot exceed 255 characters'],
    trim: true
  },
  content: { 
    type: String,
    trim: true
  },
  images: [{ 
    type: String,
    maxlength: [255, 'Image URL cannot exceed 255 characters']
  }], 
  category: { 
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  is_pinned: { type: Boolean, default: false },
  pinned_at: { type: Date },
  is_violating: { type: Boolean, default: false },
  likes: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  hearts: [{ type: Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

module.exports = mongoose.model('ForumPost', forumPostSchema);
