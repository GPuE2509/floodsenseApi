const Workshop = require('../../models/Workshop');
const WorkshopStaff = require('../../models/WorkshopStaff');
const User = require('../../models/User');

exports.registerWorkshop = async (userId, { name, phone, address, lat, lng }) => {
  // Check if user already has an active or pending workshop (as owner)
  const staffLinks = await WorkshopStaff.find({ user_id: userId, is_owner: true });
  for (const staffLink of staffLinks) {
    const existingWorkshop = await Workshop.findById(staffLink.workshop_id);
    if (existingWorkshop) {
      if (existingWorkshop.status === 'Pending_Approval') {
        const error = new Error('Your workshop registration request is pending approval.');
        error.status = 400;
        throw error;
      } else if (existingWorkshop.status === 'Active') {
        const error = new Error('You have successfully registered a workshop before.');
        error.status = 400;
        throw error;
      }
    }
  }

  // Basic validation
  if (!name || !name.trim()) {
    const error = new Error('Workshop name is required.');
    error.status = 400;
    throw error;
  }
  if (!phone || !phone.trim()) {
    const error = new Error('Phone number is required.');
    error.status = 400;
    throw error;
  }
  if (!address || !address.trim()) {
    const error = new Error('Address is required.');
    error.status = 400;
    throw error;
  }
  if (lat === undefined || lng === undefined) {
    const error = new Error('Location coordinates (longitude, latitude) are required.');
    error.status = 400;
    throw error;
  }

  // Create new Workshop (default status: Pending_Approval)
  const newWorkshop = new Workshop({
    name: name.trim(),
    phone: phone.trim(),
    address: address.trim(),
    lat: parseFloat(lat),
    lng: parseFloat(lng),
    is_open: true,
    status: 'Pending_Approval'
  });

  await newWorkshop.save();

  // Create Owner info in WorkshopStaff (status: Inactive when not yet approved)
  const newStaff = new WorkshopStaff({
    workshop_id: newWorkshop._id,
    user_id: userId,
    workshop_name: newWorkshop.name,
    is_owner: true,
    status: 'Inactive'
  });

  await newStaff.save();

  // Notify Admin and Manager roles
  try {
    const user = await User.findById(userId);
    const userName = user ? user.full_name : 'A user';
    const Notification = require('../../models/Notification');

    await Notification.create({
      recipient_role: 'Admin',
      title: 'New Workshop Registration Request',
      body: `${userName} has submitted a registration request for "${newWorkshop.name}" workshop.`,
      type: 'System_Alert',
      reference_id: newWorkshop._id,
      metadata: {
        sender_name: userName,
        web_url: '/admin/accounts'
      }
    });

    await Notification.create({
      recipient_role: 'Manager',
      title: 'New Workshop Registration Request',
      body: `${userName} has submitted a registration request for "${newWorkshop.name}" workshop.`,
      type: 'System_Alert',
      reference_id: newWorkshop._id,
      metadata: {
        sender_name: userName,
        web_url: '/admin/accounts'
      }
    });
  } catch (err) {
    console.error('Failed to create workshop registration notifications:', err);
  }

  return newWorkshop;
};

exports.cancelWorkshopRegistration = async (userId) => {
  const staffLinks = await WorkshopStaff.find({ user_id: userId, is_owner: true });
  
  let targetStaffLink = null;
  let targetWorkshop = null;
  
  for (const staffLink of staffLinks) {
    const workshop = await Workshop.findById(staffLink.workshop_id);
    if (workshop) {
      if (['Pending_Approval', 'Active', 'Suspended'].includes(workshop.status)) {
        targetStaffLink = staffLink;
        targetWorkshop = workshop;
        break;
      }
    }
  }

  if (!targetStaffLink || !targetWorkshop) {
    const error = new Error('Could not find your workshop registration information to cancel.');
    error.status = 404;
    throw error;
  }

  // Update workshop status to Canceled
  targetWorkshop.status = 'Canceled';
  await targetWorkshop.save();

  // Update owner staff link status to Inactive
  targetStaffLink.status = 'Inactive';
  await targetStaffLink.save();

  // Revoke Workshop role from User, resetting back to User
  await User.findByIdAndUpdate(userId, { role: 'User' });
};

exports.toggleWorkshopStatus = async (userId, { action }) => {
  const staffLinks = await WorkshopStaff.find({ user_id: userId, is_owner: true });
  
  let targetWorkshop = null;
  for (const staffLink of staffLinks) {
    const workshop = await Workshop.findById(staffLink.workshop_id);
    if (workshop && ['Active', 'Suspended'].includes(workshop.status)) {
      targetWorkshop = workshop;
      break;
    }
  }

  if (!targetWorkshop) {
    const error = new Error('Could not find your workshop information.');
    error.status = 404;
    throw error;
  }

  if (action === 'pause') {
    if (targetWorkshop.status === 'Suspended') {
      const error = new Error('Workshop is already paused.');
      error.status = 400;
      throw error;
    }
    targetWorkshop.status = 'Suspended';
    targetWorkshop.is_open = false;
  } else if (action === 'resume') {
    if (targetWorkshop.status === 'Active') {
      const error = new Error('Workshop is already active.');
      error.status = 400;
      throw error;
    }
    targetWorkshop.status = 'Active';
  } else {
    const error = new Error('Invalid action. Only "pause" or "resume" are accepted.');
    error.status = 400;
    throw error;
  }

  await targetWorkshop.save();
  return targetWorkshop;
};
