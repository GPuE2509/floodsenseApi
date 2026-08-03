const mongoose = require('mongoose');
const { Schema } = mongoose;

const postReactionSchema = new Schema({
  post_id: { type: Schema.Types.ObjectId, ref: 'ForumPost', required: [true, 'Post ID is required'] },
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: [true, 'User ID is required'] },
  type: { 
    type: String, 
    enum: {
      values: ['Like', 'Heart'],
      message: 'Invalid reaction type'
    },
    required: [true, 'Reaction type is required']
  }
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });

module.exports = mongoose.model('PostReaction', postReactionSchema);
