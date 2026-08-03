const mongoose = require('mongoose');

const dataRetentionPolicySchema = new mongoose.Schema({
  auto_archive_enabled: {
    type: Boolean,
    default: false, // Default OFF until toggled ON by Admin
  },
  schedule_cron: {
    type: String,
    default: '0 1 1 * *', // 01:00 AM on day 1 of every month
  },
  sensory_retention_days: {
    type: Number,
    default: 90, // Keep sensory water level telemetry for 90 days before cold archiving
  },
  incidents_retention_days: {
    type: Number,
    default: 180, // Keep incident reports for 180 days before cold archiving
  },
  system_logs_retention_days: {
    type: Number,
    default: 180, // Keep security audit system logs for 180 days
  },
  rescues_retention_days: {
    type: Number,
    default: 365, // Keep rescue sessions for 365 days
  },
  updated_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  updated_at: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

module.exports = mongoose.model('DataRetentionPolicy', dataRetentionPolicySchema);
