const Volunteer = require('../../models/Volunteer');
const { uploadImage } = require('../../utils/uploadCloudinary');

exports.getVolunteerProfile = async (userId) => {
  const volunteer = await Volunteer.findOne({ user_id: userId }).sort({ registered_at: -1 });
  if (!volunteer) {
    const error = new Error('Volunteer profile not found.');
    error.status = 404;
    throw error;
  }
  const RescueSession = require('../../models/RescueSession');
  const totalMissions = await RescueSession.countDocuments({
    assigned_volunteer_id: volunteer._id,
    status: 'Completed'
  });
  return {
    ...volunteer.toObject(),
    total_missions: totalMissions
  };
};

exports.updateVolunteerProfile = async (userId, { vehicle_type, vehicle_plate, current_lat, current_lng }, file) => {
  const volunteer = await Volunteer.findOne({ user_id: userId }).sort({ registered_at: -1 });
  if (!volunteer) {
    const error = new Error('Volunteer profile not found.');
    error.status = 404;
    throw error;
  }

  if (['Canceled', 'Suspended'].includes(volunteer.status)) {
    const error = new Error('Cannot edit profile in its current state.');
    error.status = 400;
    throw error;
  }

  if (vehicle_type) {
    const validVehicleTypes = ['Canoe', 'Pickup_Truck', 'Wading_Motorcycle', 'Other'];
    if (!validVehicleTypes.includes(vehicle_type)) {
      const error = new Error('Invalid vehicle type.');
      error.status = 400;
      throw error;
    }
    volunteer.vehicle_type = vehicle_type;
  }

  if (vehicle_plate !== undefined) {
    if (!vehicle_plate.trim()) {
      const error = new Error('Vehicle license plate is required.');
      error.status = 400;
      throw error;
    }
    const plateRegex = /^[1-9][0-9][A-Z][A-Z0-9]?[\s-]?[0-9]{3}\.?[0-9]{2}$|^[1-9][0-9][A-Z][A-Z0-9]?[\s-]?[0-9]{4}$/i;
    if (!plateRegex.test(vehicle_plate.trim())) {
      const error = new Error('Invalid vehicle license plate (e.g., 65H-123.45).');
      error.status = 400;
      throw error;
    }
    volunteer.vehicle_plate = vehicle_plate.trim().toUpperCase();
  }

  if (current_lat !== undefined) volunteer.current_lat = parseFloat(current_lat) || undefined;
  if (current_lng !== undefined) volunteer.current_lng = parseFloat(current_lng) || undefined;

  // Handle image upload if a new file is provided
  if (file) {
    try {
      const folder = `smart-flood-traffic/volunteers/${userId}`;
      const publicId = `vehicle-${userId}-${Date.now()}`;
      const result = await uploadImage(file.buffer, folder, publicId);
      volunteer.vehicle_image = result.secure_url;
    } catch (uploadError) {
      console.error('Error uploading vehicle image:', uploadError);
      const error = new Error('Error uploading new vehicle image. Please try again.');
      error.status = 500;
      throw error;
    }
  }

  await volunteer.save();
  return volunteer;
};

exports.updateVolunteerLocation = async (userId, { lat, lng }) => {
  const volunteer = await Volunteer.findOne({ user_id: userId }).sort({ registered_at: -1 });
  if (!volunteer) {
    const error = new Error('Volunteer profile not found.');
    error.status = 404;
    throw error;
  }

  if (['Canceled', 'Suspended', 'Inactive'].includes(volunteer.status)) {
    const error = new Error('Cannot update location for inactive/suspended/canceled volunteer.');
    error.status = 400;
    throw error;
  }

  if (lat != null) volunteer.current_lat = parseFloat(lat);
  if (lng != null) volunteer.current_lng = parseFloat(lng);

  await volunteer.save();
  return volunteer;
};

exports.getActiveVolunteers = async () => {
  return await Volunteer.find({
    status: { $in: ['Available', 'Busy'] },
    current_lat: { $ne: null },
    current_lng: { $ne: null }
  }).populate('user_id', 'full_name phone');
};

