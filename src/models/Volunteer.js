const mongoose = require('mongoose');
const { Schema } = mongoose;

const volunteerSchema = new Schema({
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: [true, 'User ID is required'] },
  status: { 
    type: String, 
    enum: {
      values: ['Pending_Approval', 'Approved', 'Rejected', 'Canceled', 'Available', 'Busy', 'Inactive', 'Suspended'],
      message: 'Invalid volunteer status'
    },
    default: 'Pending_Approval' 
  },
  vehicle_type: { 
    type: String, 
    enum: {
      values: ['Canoe', 'Pickup_Truck', 'Wading_Motorcycle', 'Other'],
      message: 'Invalid vehicle type'
    }
  },
  vehicle_plate: { 
    type: String, 
    required: [true, 'Vehicle license plate is required'],
    maxlength: [20, 'Vehicle license plate cannot exceed 20 characters'],
    trim: true,
    uppercase: true,
    match: [/^[1-9][0-9][A-Z][A-Z0-9]?[\s-]?[0-9]{3}\.?[0-9]{2}$|^[1-9][0-9][A-Z][A-Z0-9]?[\s-]?[0-9]{4}$/i, 'Invalid vehicle license plate (e.g., 65H-123.45)']
  },
  vehicle_image: {
    type: String,
    maxlength: [255, 'Vehicle image URL cannot exceed 255 characters']
  },
  current_lng: { 
    type: Number,
    min: [-180, 'Longitude must be between -180 and 180'],
    max: [180, 'Longitude must be between -180 and 180']
  },
  current_lat: { 
    type: Number,
    min: [-90, 'Latitude must be between -90 and 90'],
    max: [90, 'Latitude must be between -90 and 90']
  },
  registered_at: { type: Date, default: Date.now }
}, { timestamps: false });

module.exports = mongoose.model('Volunteer', volunteerSchema);
