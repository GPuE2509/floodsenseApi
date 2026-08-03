const Volunteer = require('../../models/Volunteer');
const User = require('../../models/User');
const { uploadImage } = require('../../utils/uploadCloudinary');

exports.registerVolunteer = async (userId, { vehicle_type, vehicle_plate, current_lat, current_lng }, file) => {
  // Check if user already has a volunteer profile
  let existingVolunteer = await Volunteer.findOne({ user_id: userId }).sort({ registered_at: -1 });
  if (existingVolunteer) {
    if (existingVolunteer.status === 'Canceled' || existingVolunteer.status === 'Rejected') {
      // Allow creating a new record
    } else {
      const error = new Error(existingVolunteer.status === 'Pending_Approval' 
        ? 'Your registration request is pending approval.' 
        : 'You have registered a Volunteer profile.');
      error.status = 400;
      throw error;
    }
  }

  // Validation
  if (!vehicle_type) {
    const error = new Error('Vehicle type is required.');
    error.status = 400;
    throw error;
  }

  if (!vehicle_plate || !vehicle_plate.trim()) {
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

  const validVehicleTypes = ['Canoe', 'Pickup_Truck', 'Wading_Motorcycle', 'Other'];
  if (!validVehicleTypes.includes(vehicle_type)) {
    const error = new Error('Invalid vehicle type.');
    error.status = 400;
    throw error;
  }

  // Require file if there is no previous image
  let previousImage = existingVolunteer ? existingVolunteer.vehicle_image : null;
  if (!file && !previousImage) {
    const error = new Error('Vehicle image is required.');
    error.status = 400;
    throw error;
  }

  // Upload vehicle image if a new one is provided
  let vehicle_image_url = previousImage || '';
  if (file) {
    try {
      const folder = `smart-flood-traffic/volunteers/${userId}`;
      const publicId = `vehicle-${userId}-${Date.now()}`;
      const result = await uploadImage(file.buffer, folder, publicId);
      vehicle_image_url = result.secure_url;
    } catch (uploadError) {
      console.error('Error uploading vehicle image:', uploadError);
      const error = new Error('Error uploading vehicle image. Please try again.');
      error.status = 500;
      throw error;
    }
  }

  // Create Volunteer profile (always create new to keep history)
  const newVolunteer = new Volunteer({
    user_id: userId,
    status: 'Pending_Approval',
    vehicle_type,
    vehicle_plate: vehicle_plate ? vehicle_plate.trim().toUpperCase() : '',
    vehicle_image: vehicle_image_url,
    current_lat: current_lat ? parseFloat(current_lat) : undefined,
    current_lng: current_lng ? parseFloat(current_lng) : undefined
  });

  await newVolunteer.save();

  // Notify Admin and Manager roles
  try {
    const user = await User.findById(userId);
    const userName = user ? user.full_name : 'A user';
    const Notification = require('../../models/Notification');
    
    await Notification.create({
      recipient_role: 'Admin',
      title: 'New Volunteer Registration Request',
      body: `${userName} has submitted a registration request to become a Volunteer.`,
      type: 'System_Alert',
      reference_id: newVolunteer._id,
      metadata: {
        sender_name: userName,
        web_url: '/admin/accounts'
      }
    });

    await Notification.create({
      recipient_role: 'Manager',
      title: 'New Volunteer Registration Request',
      body: `${userName} has submitted a registration request to become a Volunteer.`,
      type: 'System_Alert',
      reference_id: newVolunteer._id,
      metadata: {
        sender_name: userName,
        web_url: '/admin/accounts'
      }
    });
  } catch (err) {
    console.error('Failed to create volunteer registration notifications:', err);
  }

  return newVolunteer;
};

exports.toggleVolunteerStatus = async (userId, { action }) => {
  const volunteer = await Volunteer.findOne({ user_id: userId }).sort({ registered_at: -1 });
  if (!volunteer) {
    const error = new Error('Volunteer profile not found.');
    error.status = 404;
    throw error;
  }

  if (action === 'pause') {
    if (volunteer.status === 'Inactive') {
      const error = new Error('Profile is already paused.');
      error.status = 400;
      throw error;
    }
    volunteer.status = 'Inactive';
  } else if (action === 'resume') {
    if (volunteer.status === 'Approved') {
      const error = new Error('Profile is already active.');
      error.status = 400;
      throw error;
    }
    volunteer.status = 'Approved';
  } else {
    const error = new Error('Invalid action. Only "pause" or "resume" are accepted.');
    error.status = 400;
    throw error;
  }

  await volunteer.save();
  return volunteer;
};

exports.cancelVolunteerRegistration = async (userId) => {
  const volunteer = await Volunteer.findOne({ user_id: userId }).sort({ registered_at: -1 });
  if (!volunteer) {
    const error = new Error('Volunteer profile not found.');
    error.status = 404;
    throw error;
  }

  if (['Canceled', 'Suspended'].includes(volunteer.status)) {
    const error = new Error('This profile cannot be cancelled/withdrawn in its current state.');
    error.status = 400;
    throw error;
  }

  // Change status to Canceled
  volunteer.status = 'Canceled';
  await volunteer.save();

  // Revoke Volunteer role from User
  await User.findByIdAndUpdate(userId, { role: 'User' });
  return volunteer;
};
