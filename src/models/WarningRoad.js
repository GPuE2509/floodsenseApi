const mongoose = require('mongoose');
const { Schema } = mongoose;

const lineStringSchema = new Schema({
  type: {
    type: String,
    enum: ['LineString'],
    required: true
  },
  coordinates: {
    type: [[Number]], // Array of [longitude, latitude]
    required: true
  }
}, { _id: false });

const warningRoadSchema = new Schema({
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: [true, 'User ID is required'] },
  road_name: {
    type: String,
    maxlength: [100, 'Road name cannot exceed 100 characters'],
    trim: true,
    required: [true, 'Road name is required']
  },
  polyline: {
    type: lineStringSchema,
    required: [true, 'Road polyline is required']
  },
  is_active: { type: Boolean, default: true }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

warningRoadSchema.index({ polyline: '2dsphere' });

module.exports = mongoose.model('WarningRoad', warningRoadSchema);
