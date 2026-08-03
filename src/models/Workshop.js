const mongoose = require('mongoose');
const { Schema } = mongoose;

const workshopSchema = new Schema({
  name: {
    type: String,
    maxlength: [100, 'Workshop name cannot exceed 100 characters'],
    trim: true
  },
  phone: {
    type: String,
    maxlength: [10, 'Phone number cannot exceed 10 characters'],
    match: [/^(03[2-9]|05[25689]|07[06-9]|08[1-9]|09[0-9])\d{7}$/, 'Invalid Vietnamese mobile phone number']
  },
  address: {
    type: String,
    maxlength: [255, 'Address cannot exceed 255 characters'],
    trim: true
  },
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
  services: [{
    id: { type: String },
    service_name: {
      type: String,
      required: [true, 'Service name is required'],
      trim: true
    },
    base_price: {
      type: Number,
      required: [true, 'Service price is required'],
      min: [0, 'Price cannot be negative']
    },
    category: { type: String, default: 'Basic repair' },
    unit: { type: String, default: 'turn' },
    desc: { type: String, default: '' },
    active: { type: Boolean, default: true }
  }],
  is_open: { type: Boolean, default: true },
  open_time: { type: String, default: '08:00' },
  close_time: { type: String, default: '17:00' },
  weekly_calendar: {
    type: [{
      day_group: { type: String, required: true },
      open_time: { type: String, default: '08:00' },
      close_time: { type: String, default: '17:00' },
      is_active: { type: Boolean, default: true }
    }],
    default: [
      { day_group: "Monday – Friday", open_time: '08:00', close_time: '17:00', is_active: true },
      { day_group: "Saturday", open_time: '08:00', close_time: '17:00', is_active: true },
      { day_group: "Sunday", open_time: '08:00', close_time: '17:00', is_active: true }
    ]
  },
  is_mobile: { type: Boolean, default: false },
  coverage_radius: { type: Number, default: 5 },
  cover_photo: { type: String, default: '' },
  rating_average: {
    type: Number,
    default: 0,
    min: [0, 'Rating score cannot be negative'],
    max: [5, 'Rating score cannot exceed 5']
  },
  rating_count: {
    type: Number,
    default: 0,
    min: [0, 'Review count cannot be negative']
  },
  status: {
    type: String,
    enum: {
      values: ['Pending_Approval', 'Active', 'Suspended', 'Canceled'],
      message: 'Invalid workshop status'
    },
    default: 'Pending_Approval'
  }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

module.exports = mongoose.model('Workshop', workshopSchema);
