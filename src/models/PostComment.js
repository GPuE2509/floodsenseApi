const mongoose = require('mongoose');
const { Schema } = mongoose;

const postCommentSchema = new Schema({
  post_id: { type: Schema.Types.ObjectId, ref: 'ForumPost', required: [true, 'Post ID is required'] },
  author_id: { type: Schema.Types.ObjectId, ref: 'User', required: [true, 'Comment author is required'] },
  parent_id: { type: Schema.Types.ObjectId, ref: 'PostComment' },
  content: { 
    type: String,
    trim: true
  },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

module.exports = mongoose.model('PostComment', postCommentSchema);
