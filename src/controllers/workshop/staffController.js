const staffService = require('../../services/workshop/staffService');

exports.inviteStaff = async (req, res, next) => {
  try {
    const ownerId = req.user._id;
    const { phone_or_email } = req.body;

    if (!phone_or_email) {
      const error = new Error('Phone number or email is required.');
      error.status = 400;
      throw error;
    }

    const newStaff = await staffService.inviteStaff(ownerId, { phone_or_email });
    return res.status(201).json({
      message: 'Invitation sent successfully.',
      staff: newStaff
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Server error while sending invitation.' });
  }
};

exports.getMyInvitations = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const invitations = await staffService.getMyInvitations(userId);
    return res.status(200).json({
      message: 'Fetched invitations successfully.',
      invitations
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error while fetching invitations.' });
  }
};

exports.getWorkshopStaff = async (req, res, next) => {
  try {
    const ownerId = req.user._id;
    const staffResult = await staffService.getWorkshopStaff(ownerId);
    return res.status(200).json({
      message: 'Fetched staff successfully.',
      staff: staffResult.staff,
      isOwner: staffResult.isOwner
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Server error while fetching staff.' });
  }
};

exports.acceptInvitation = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const invitationId = req.params.id;

    if (!invitationId) {
      const error = new Error('Invitation ID is required.');
      error.status = 400;
      throw error;
    }

    const acceptedStaff = await staffService.acceptInvitation(userId, invitationId);
    return res.status(200).json({
      message: 'Invitation accepted successfully.',
      staff: acceptedStaff
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Server error while accepting invitation.' });
  }
};

exports.declineInvitation = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const invitationId = req.params.id;

    if (!invitationId) {
      const error = new Error('Invitation ID is required.');
      error.status = 400;
      throw error;
    }

    const result = await staffService.declineInvitation(userId, invitationId);
    return res.status(200).json({
      message: 'Invitation declined successfully.',
      result
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Server error while declining invitation.' });
  }
};

exports.toggleSuspendStaff = async (req, res, next) => {
  try {
    const ownerId = req.user._id;
    const { userId } = req.params;

    if (!userId) {
      const error = new Error('User ID is required.');
      error.status = 400;
      throw error;
    }

    const result = await staffService.toggleSuspendStaff(ownerId, userId);
    return res.status(200).json({
      message: 'Staff suspension status toggled successfully.',
      result
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Server error while toggling suspension status.' });
  }
};

exports.updateStaffLocation = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { lat, lng } = req.body;

    if (lat == null || lng == null) {
      return res.status(400).json({ success: false, message: 'Latitude and longitude are required.' });
    }

    const updatedStaff = await staffService.updateStaffLocation(userId, parseFloat(lat), parseFloat(lng));
    return res.status(200).json({
      success: true,
      message: 'Staff location updated successfully.',
      staff: updatedStaff
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: 'Server error while updating staff location.' });
  }
};

exports.cancelInvitation = async (req, res, next) => {
  try {
    const ownerId = req.user._id;
    const { userId } = req.params;

    if (!userId) {
      const error = new Error('User ID is required.');
      error.status = 400;
      throw error;
    }

    const result = await staffService.cancelInvitation(ownerId, userId);
    return res.status(200).json({
      message: 'Invitation canceled successfully.',
      result
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Server error while canceling invitation.' });
  }
};

exports.fireStaff = async (req, res, next) => {
  try {
    const ownerId = req.user._id;
    const { userId } = req.params;

    if (!userId) {
      const error = new Error('User ID is required.');
      error.status = 400;
      throw error;
    }

    const result = await staffService.fireStaff(ownerId, userId);
    return res.status(200).json({
      message: 'Staff member fired successfully.',
      result
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Server error while firing staff member.' });
  }
};
