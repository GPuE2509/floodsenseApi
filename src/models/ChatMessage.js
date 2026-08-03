const mongoose = require('mongoose');
const { Schema } = mongoose;

const chatMessageSchema = new Schema({
  rescue_session_id: { type: Schema.Types.ObjectId, ref: 'RescueSession', required: [true, 'Rescue session ID is required'] },
  sender_id: { type: Schema.Types.ObjectId, ref: 'User', required: [true, 'Sender ID is required'] },
  message_text: { 
    type: String,
    trim: true
  },
}, { timestamps: { createdAt: 'sent_at', updatedAt: false } });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
