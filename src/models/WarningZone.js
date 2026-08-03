const mongoose = require('mongoose');
const { Schema } = mongoose;

const pointSchema = new Schema({
  type: {
    type: String,
    enum: ['Point'],
    required: true
  },
  coordinates: {
    type: [Number],
    required: true
  }
}, { _id: false });

const warningZoneSchema = new Schema({
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: [true, 'User ID is required'] },
  zone_name: { 
    type: String, 
    maxlength: [100, 'Warning zone name cannot exceed 100 characters'],
    trim: true
  },
  location: {
    type: pointSchema,
    required: [true, 'Location is required']
  },
  radius_meters: { 
    type: Number,
    min: [0, 'Radius cannot be negative']
  },
  address: { type: String },
  level: { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },
  is_active: { type: Boolean, default: true }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

warningZoneSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('WarningZone', warningZoneSchema);
