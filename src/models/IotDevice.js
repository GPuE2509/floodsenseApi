const mongoose = require('mongoose');
const { Schema } = mongoose;

const iotDeviceSchema = new Schema({
  device_code: { 
    type: String, 
    required: [true, 'Device code is required'],
    unique: true, 
    maxlength: [50, 'Device code cannot exceed 50 characters'],
    trim: true,
    uppercase: true,
    match: [/^\S+$/, 'Device code cannot contain spaces']
  },
  name: { 
    type: String, 
    required: [true, 'Device name is required'],
    maxlength: [100, 'Device name cannot exceed 100 characters'],
    trim: true
  },
  lng: { 
    type: Number,
    required: [true, 'Longitude is required'],
    min: [-180, 'Longitude must be between -180 and 180'],
    max: [180, 'Longitude must be between -180 and 180']
  },
  lat: { 
    type: Number,
    required: [true, 'Latitude is required'],
    min: [-90, 'Latitude must be between -90 and 90'],
    max: [90, 'Latitude must be between -90 and 90']
  },
  status: { 
    type: String, 
    enum: {
      values: ['Online', 'Offline', 'Maintenance'],
      message: 'Invalid device status'
    },
    default: 'Offline' 
  },
  location: {
    type: String,
    required: [true, 'Location is required'],
    maxlength: [200, 'Location cannot exceed 200 characters'],
    trim: true
  },
  image_url: {
    type: String,
    trim: true
  },
  calib_empty_cm: {
    type: Number,
    required: [true, 'Calibration height is required'],
    min: [0, 'Calibration height cannot be negative'],
    default: 100
  },

  current_water_level: {
    type: Number,
    default: 0
  },
  current_rising_speed: {
    type: Number,
    default: 0
  },
  water_percent: {
    type: Number,
    default: 0
  },
  warning_water_status: {
    type: String,
    enum: {
      values: ['safe', 'slight', 'moderate', 'severe', 'critical'],
      message: 'Invalid warning water status'
    },
    default: 'safe'
  },
  current_battery_level: {
    type: Number,
    default: 0
  },
  sleep_interval_minutes: {
    type: Number,
    required: [true, 'Sleep interval is required'],
    min: [1, 'Sleep interval cannot be less than 1 minute'],
    default: 1
  },
  last_reading_time: {
    type: Date,
    default: null
  },
  battery_level: { 
    type: Number,
    min: [0, 'Battery level cannot be negative'],
    max: [100, 'Battery level cannot exceed 100%']
  },
  last_ping: { type: Date },
  is_disabled: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

iotDeviceSchema.pre('save', async function(next) {
  try {
    const SystemConfig = mongoose.model('SystemConfig');
    const config = await SystemConfig.findOne({ key: 'default' });

    const calib = this.calib_empty_cm || 100;
    const level = this.current_water_level || 0;
    const pct = (level / calib) * 100;
    this.water_percent = parseFloat(pct.toFixed(2));

    const l1 = config?.water_level_l1 ?? 20;
    const l2 = config?.water_level_l2 ?? 40;
    const l3 = config?.water_level_l3 ?? 50;
    const l4 = config?.water_level_l4 ?? 60;

    if (pct >= l4) {
      this.warning_water_status = 'critical';
    } else if (pct >= l3) {
      this.warning_water_status = 'severe';
    } else if (pct >= l2) {
      this.warning_water_status = 'moderate';
    } else if (pct >= l1) {
      this.warning_water_status = 'slight';
    } else {
      this.warning_water_status = 'safe';
    }

    if (!this.is_disabled && this.status !== 'Maintenance') {
      this.status = level > 5 ? 'Online' : 'Offline';
    }

    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model('IotDevice', iotDeviceSchema);
