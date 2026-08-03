const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const emergencyGuidelineSchema = new Schema({
  type: {
    type: String,
    required: true,
    enum: ['hotline', 'guideline']
  },
  title: {
    type: String,
    required: true,
    maxlength: 100
  },
  phone_number: {
    type: String, // Used for 'hotline'
    default: '',
    maxlength: 10,
    match: [/^[0-9+]*$/, 'Phone number can only contain digits and optionally a plus sign']
  },
  description: {
    type: String, // Used for 'hotline' description
    default: '',
    maxlength: 500
  },
  icon: {
    type: String, // E.g., 'Icons.warning'
    default: ''
  },
  color: {
    type: String, // E.g., 'AppColors.alertRed' or hex
    default: ''
  },
  tips: {
    type: [{
      type: String,
      maxlength: [500, 'Each tip cannot exceed 500 characters']
    }], // Array of strings for 'guideline'
    default: []
  },
  actions: [{
    label: { type: String, required: true },
    link: { type: String, required: true },
    icon: { type: String },
    color: { type: String }
  }],
  order: {
    type: Number,
    default: 0
  },
  is_active: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

module.exports = mongoose.model('EmergencyGuideline', emergencyGuidelineSchema);