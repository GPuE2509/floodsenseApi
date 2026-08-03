const mongoose = require('mongoose');
const { Schema } = mongoose;

const messageSchema = new Schema({
  sender_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  receiver_id: { type: Schema.Types.ObjectId, ref: 'User' }, // Optional (for DMs)
  group_id: { type: String }, // Optional (for group chats, e.g. group-..., volunteer-group-...)
  members: [{ type: Schema.Types.ObjectId, ref: 'User' }], // Optional (for group chats)
  message_text: { type: String, required: true },
  sent_at: { type: Date, default: Date.now },
  is_read: { type: Boolean, default: false }
}, { timestamps: false });

module.exports = mongoose.model('Message', messageSchema);
