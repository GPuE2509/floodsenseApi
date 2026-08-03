const mongoose = require('mongoose');

const shiftTemplateSchema = new mongoose.Schema({
  workshopId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workshop',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['fixed', 'flex', 'on-call'],
    required: true
  },
  startTime: {
    type: String,
    required: true // Format HH:mm
  },
  endTime: {
    type: String,
    required: true // Format HH:mm
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('ShiftTemplate', shiftTemplateSchema);
