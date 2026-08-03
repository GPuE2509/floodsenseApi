const EmergencyGuideline = require('../models/EmergencyGuideline');

exports.getAllGuidelines = async () => {
  return await EmergencyGuideline.find({ is_active: true }).sort({ order: 1, createdAt: 1 });
};

exports.getAllGuidelinesAdmin = async () => {
  return await EmergencyGuideline.find().sort({ order: 1, createdAt: 1 });
};

// Feature Add Emergency Guideline
exports.createGuideline = async (data) => {
  // If order is not specified or 0, assign a large number to place it at the end
  if (!data.order) {
    data.order = Date.now();
  }
  const newGuideline = new EmergencyGuideline(data);
  return await newGuideline.save();
};

// Feature Update Emergency Guideline
exports.updateGuidelineById = async (id, data) => {
  return await EmergencyGuideline.findByIdAndUpdate(id, data, { new: true, runValidators: true });
};

// Feature Delete Emergency Guideline
exports.deleteGuidelineById = async (id) => {
  return await EmergencyGuideline.findByIdAndDelete(id);
};