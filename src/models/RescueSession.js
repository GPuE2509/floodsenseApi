const mongoose = require('mongoose');
const { Schema } = mongoose;

const rescueSessionSchema = new Schema({
  requester_id: { type: Schema.Types.ObjectId, ref: 'User', required: [true, 'Requester ID is required'] },
  sender_phone: { 
    type: String, 
    maxlength: [20, 'Phone number cannot exceed 20 characters'],
    match: [/^[\d\+\-\(\)\s]+$/, 'Invalid phone number']
  },
  emergency_type: { 
    type: String, 
    enum: {
      values: ['Trapped_By_Flood', 'Medical', 'Vehicle_Broken', 'Other'],
      message: 'Invalid warning type'
    }
  },
  custom_emergency_type: {
    type: String,
    maxlength: [100, 'Custom emergency type cannot exceed 100 characters']
  },
  photos: {
    type: String
  },
  description: { 
    type: String,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  initial_lng: { 
    type: Number,
    min: [-180, 'Longitude must be between -180 and 180'],
    max: [180, 'Longitude must be between -180 and 180']
  },
  initial_lat: { 
    type: Number,
    min: [-90, 'Latitude must be between -90 and 90'],
    max: [90, 'Latitude must be between -90 and 90']
  },
  assigned_volunteer_id: { type: Schema.Types.ObjectId, ref: 'Volunteer' },
  assigned_staff_id: { type: Schema.Types.ObjectId, ref: 'WorkshopStaff' },
  workshop_id: { type: Schema.Types.ObjectId, ref: 'Workshop' },
  selected_services: [{
    id: { type: String },
    service_name: { type: String },
    base_price: { type: Number },
    unit: { type: String }
  }],
  status: { 
    type: String, 
    enum: {
      values: ['Pending', 'Assigned', 'In_Progress', 'Arrived', 'Completed', 'Cancelled'],
      message: 'Invalid rescue status'
    },
    default: 'Pending' 
  },
  safe_photos: { type: String },
  safe_checked_in: { type: Boolean, default: false },
  completed_at: { type: Date },
  is_paid: { type: Boolean, default: false }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

module.exports = mongoose.model('RescueSession', rescueSessionSchema);
