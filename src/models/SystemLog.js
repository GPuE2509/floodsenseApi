const mongoose = require('mongoose');
const { Schema } = mongoose;

const systemLogSchema = new Schema({
  operator_id: { type: Schema.Types.ObjectId, ref: 'User', required: [true, 'Admin ID is required'] },
  action: { 
    type: String,
    enum: {
      values: ['SUSPEND_USER', 'REACTIVATE_USER', 'APPROVE_REPORT', 'REJECT_REPORT', 'ARCHIVE_REPORT', 'DELETE_POST', 'FEATURE_TOGGLE'],
      message: 'Invalid action'
    },
    required: [true, 'Action is required']
  },
  target_id: { type: Schema.Types.ObjectId },
  reason: { 
    type: String,
    trim: true
  },
}, { timestamps: { createdAt: 'timestamp', updatedAt: false } });

module.exports = mongoose.model('SystemLog', systemLogSchema);
