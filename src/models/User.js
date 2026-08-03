const mongoose = require('mongoose');
const { Schema } = mongoose;

const userSchema = new Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    maxlength: [255, 'Email cannot exceed 255 characters'],
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Invalid email']
  },
  password_hash: {
    type: String,
    maxlength: [255, 'Password hash cannot exceed 255 characters'],
    minlength: [60, 'Password hash must be at least 60 characters']
  },
  google_id: {
    type: String,
    maxlength: [255, 'Google ID cannot exceed 255 characters']
  },
  is_verified: { type: Boolean, default: false },
  otp: {
    type: String,
    minlength: [6, 'OTP must have 6 digits'],
    maxlength: [6, 'OTP must have 6 digits'],
    match: [/^\d{6}$/, 'OTP must be 6 digits']
  },
  otp_expired: { type: Date },
  otp_sent_at: {
    type: Date,
  },
  otp_resend_available_at: {
    type: Date,
  },
  otp_resend_count: {
    type: Number,
    default: 0,
    min: [0, 'OTP resend count cannot be negative']
  },
  reset_token: { type: String },
  reset_token_expired: { type: Date },
  status: {
    type: String,
    enum: {
      values: ['Pending', 'Active', 'Suspended'],
      message: 'Invalid status'
    },
    default: 'Pending'
  },
  role: {
    type: String,
    enum: {
      values: ['Guest', 'User', 'Volunteer', 'Workshop', 'Manager', 'Admin'],
      message: 'Invalid role'
    },
    default: 'Guest',
    required: true,
  },
  full_name: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true,
    minlength: [2, 'Full name must have at least 2 characters'],
    maxlength: [100, 'Full name cannot exceed 100 characters']
  },
  phone: {
    type: String,
    maxlength: [20, 'Phone number cannot exceed 20 characters'],
    validate: {
      validator: function (v) {
        if (!v) return true;
        return /^(0|\+84)\d{9}$/.test(v);
      },
      message: 'Invalid phone number (must be 10 digits starting with 0 or +84)'
    }
  },
  dob: {
    type: String,
    maxlength: [10, 'Date of birth cannot exceed 10 characters'],
    validate: {
      validator: function (v) {
        if (!v) return true;
        return /^\d{4}-\d{2}-\d{2}$/.test(v);
      },
      message: 'Date of birth must be in YYYY-MM-DD format'
    }
  },
  district: {
    type: String,
    maxlength: [100, 'District / Area cannot exceed 100 characters']
  },
  avatar_url: {
    type: String,
    maxlength: [255, 'Avatar URL cannot exceed 255 characters'],
    validate: {
      validator: function (v) {
        if (!v) return true;
        return /^https?:\/\/.+/.test(v);
      },
      message: 'Avatar URL must be a valid URL'
    }
  },
  contribution_points: {
    type: Number,
    default: 0,
    min: [0, 'Contribution points cannot be negative']
  },
  monthly_points: {
    type: Number,
    default: 0,
    min: [0, 'Monthly points cannot be negative']
  },
  weekly_points: {
    type: Number,
    default: 0,
    min: [0, 'Weekly points cannot be negative']
  },
  notification_preferences: {
    masterPush: { type: Boolean, default: true },
    flood: { type: Boolean, default: true },
    sos: { type: Boolean, default: true },
    community: { type: Boolean, default: true },
    pushChannel: { type: Boolean, default: true },
    emailChannel: { type: Boolean, default: false }
  },
  emergency_contacts: [{
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    full_name: { type: String },
    email: { type: String },
    phone: { type: String },
    label: { type: String, default: 'Gia đình' },
    added_at: { type: Date, default: Date.now }
  }],
  last_login_ip: { type: String },
  last_daily_claim: { type: Date },
  daily_streak: { type: Number, default: 0, min: [0, 'Daily streak cannot be negative'] }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// NOTE: Do not automatically delete pending users when OTP expires.
// OTP expiry only means the code is invalid; user remains in Pending status
// so they can request a new OTP and complete verification.
// Cleanup pending accounts after 24 hours using MongoDB TTL on created_at.
userSchema.index({ created_at: 1 }, { expireAfterSeconds: 86400, partialFilterExpression: { status: 'Pending' } });

module.exports = mongoose.model('User', userSchema);
