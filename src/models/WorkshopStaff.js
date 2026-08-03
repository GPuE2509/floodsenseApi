const mongoose = require('mongoose');
const { Schema } = mongoose;

const workshopStaffSchema = new Schema({
  workshop_id: { type: Schema.Types.ObjectId, ref: 'Workshop', required: [true, 'Workshop ID is required'] },
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: [true, 'User ID is required'] },
  workshop_name: { 
    type: String, 
    maxlength: [100, 'Workshop name cannot exceed 100 characters'],
    trim: true
  },
  is_owner: { type: Boolean, default: false },
  status: { 
    type: String, 
    enum: {
      values: ['Pending_Invite', 'Available', 'Busy', 'Inactive', 'Suspended', 'Rejected'],
      message: 'Invalid workshop staff status'
    },
    default: 'Pending_Invite' 
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
  invited_at: { type: Date, default: Date.now },
  joined_at: { type: Date }
}, { timestamps: false });

module.exports = mongoose.model('WorkshopStaff', workshopStaffSchema);
