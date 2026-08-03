const mongoose = require('mongoose');

const shiftAssignmentSchema = new mongoose.Schema({
  scheduleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WeeklySchedule',
    required: true,
    index: true
  },
  workshopId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workshop',
    required: true,
    index: true
  },
  shiftTemplateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ShiftTemplate',
    required: true
  },
  staffId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: String, // Format YYYY-MM-DD
    required: true
  },
  status: {
    type: String,
    enum: ['assigned', 'checked-in', 'absent', 'suspended'],
    default: 'assigned'
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Create compound index for fast queries by schedule
shiftAssignmentSchema.index({ scheduleId: 1, date: 1 });

module.exports = mongoose.model('ShiftAssignment', shiftAssignmentSchema);
