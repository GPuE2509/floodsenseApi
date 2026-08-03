const mongoose = require('mongoose');

const dataRetentionLogSchema = new mongoose.Schema({
  trigger_type: {
    type: String,
    enum: ['Scheduled_Cron', 'Emergency_Manual'],
    required: true,
  },
  executed_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null, // Null if triggered by automated cron
  },
  start_time: {
    type: Date,
    default: Date.now,
  },
  end_time: {
    type: Date,
  },
  status: {
    type: String,
    enum: ['Running', 'Completed', 'Failed'],
    default: 'Running',
  },
  results: [
    {
      stream: { type: String }, // 'sensory' | 'incidents' | 'system_logs' | 'rescues'
      retention_days: { type: Number },
      cutoff_date: { type: Date },
      records_archived: { type: Number, default: 0 },
      records_purged: { type: Number, default: 0 },
      archive_filename: { type: String, default: null }, // e.g. 'sensory-archive-2026-07-01.json.gz'
      archive_filepath: { type: String, default: null },
      archive_size_bytes: { type: Number, default: 0 },
    }
  ],
  total_records_processed: {
    type: Number,
    default: 0,
  },
  total_bytes_saved: {
    type: Number,
    default: 0,
  },
  error_message: {
    type: String,
    default: null,
  },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

module.exports = mongoose.model('DataRetentionLog', dataRetentionLogSchema);
