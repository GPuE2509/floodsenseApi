const mongoose = require('mongoose');
const { Schema } = mongoose;

const incidentReportSchema = new Schema({
  reporter_id: { type: Schema.Types.ObjectId, ref: 'User' },
  title: { 
    type: String, 
    maxlength: [255, 'Title cannot exceed 255 characters'],
    trim: true
  },
  description: { 
    type: String,
    trim: true
  },
  images: { type: String },
  lng: { 
    type: Number,
    min: [-180, 'Longitude must be between -180 and 180'],
    max: [180, 'Longitude must be between -180 and 180']
  },
  lat: { 
    type: Number,
    min: [-90, 'Latitude must be between -90 and 90'],
    max: [90, 'Latitude must be between -90 and 90']
  },
  report_type: { 
    type: String, 
    enum: {
      values: ['flood', 'accident', 'tree', 'traffic', 'infra'],
      message: 'Invalid report type'
    }
  },
  ai_confidence_score: { 
    type: Number,
    min: [0, 'Confidence level cannot be negative'],
    max: [1, 'Confidence level cannot exceed 1']
  },
  is_approved_by_ai: { type: Boolean },
  moderation_status: { 
    type: String, 
    enum: {
      values: ['Pending', 'Approved', 'Rejected'],
      message: 'Invalid moderation status'
    },
    default: 'Pending' 
  },
  severity: {
    type: String,
    enum: ['Light', 'Medium', 'Serious'],
    default: 'Medium'
  },
  moderated_by: { type: Schema.Types.ObjectId, ref: 'User' },

  // === Lifecycle fields ===
  expiredAt: { type: Date },
  lifecycle_status: {
    type: String,
    enum: { values: ['Active', 'Pending_Verification', 'Archived'], message: 'Invalid lifecycle status' },
    default: 'Active'
  },
  expiration_notified: { type: Boolean, default: false },

  // === Vote fields ===
  vote_still_exist: { type: Number, default: 0 },
  vote_no_more: { type: Number, default: 0 },
  vote_wrong_report: { type: Number, default: 0 },
  voters: [{
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    vote_type: { type: String, enum: ['confirm', 'deny', 'false'], required: true },
    lat: { type: Number },
    lng: { type: Number },
    distance_m: { type: Number },
    photo_url: { type: String },
    created_at: { type: Date, default: Date.now }
  }]
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });

module.exports = mongoose.model('IncidentReport', incidentReportSchema);

