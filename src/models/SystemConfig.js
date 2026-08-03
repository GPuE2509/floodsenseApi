const mongoose = require('mongoose');
const { Schema } = mongoose;

const systemConfigSchema = new Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    default: 'default'
  },
  water_level_l1: { type: Number, default: 20 },
  water_level_l2: { type: Number, default: 40 },
  water_level_l3: { type: Number, default: 50 },
  water_level_l4: { type: Number, default: 60 },
  water_rising_speed_threshold: { type: Number, default: 5 },
  module_forum: { type: Boolean, default: true },
  module_chat: { type: Boolean, default: true },
  module_rescue: { type: Boolean, default: true },
  module_map: { type: Boolean, default: true },
  module_forecast: { type: Boolean, default: true },
  module_extensions: { type: Boolean, default: true },
  // Contribution Points Policy
  points_report_submit: { type: Number, default: 5 },
  points_report_verified_light: { type: Number, default: 8 },
  points_report_verified_medium: { type: Number, default: 12 },
  points_report_verified_serious: { type: Number, default: 20 },
  points_volunteer_assist: { type: Number, default: 20 },
  points_workshop_assist: { type: Number, default: 8 },
  points_false_report_penalty: { type: Number, default: -15 },
}, { timestamps: true });

module.exports = mongoose.model('SystemConfig', systemConfigSchema);
