const mongoose = require('mongoose');
const { Schema } = mongoose;

const waterLevelLogSchema = new Schema({
  device_id: { type: Schema.Types.ObjectId, ref: 'IotDevice', required: [true, 'Device ID is required'] },
  timestamp: { type: Date, default: Date.now },
  water_level_mm: { 
    type: Number,
    min: [0, 'Water level cannot be negative']
  },
  rising_speed_mm_per_min: { 
    type: Number,
    min: [0, 'Water rise speed cannot be negative']
  }
}, { timestamps: false });

module.exports = mongoose.model('WaterLevelLog', waterLevelLogSchema);
