const volunteerService = require('../../services/volunteer/accountService');

exports.registerVolunteerProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const volunteer = await volunteerService.registerVolunteer(userId, req.body, req.file);

    return res.status(201).json({
      message: 'Volunteer registration successful. Pending approval.',
      volunteer
    });

  } catch (error) {
    console.error('Error in registerVolunteerProfile:', error);
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    // If it's a mongoose validation error
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ message: messages.join(', ') });
    }
    return res.status(500).json({ message: 'An error occurred. Please try again later.' });
  }
};

// Pause or resume activity
exports.toggleVolunteerStatus = async (req, res) => {
  try {
    const userId = req.user._id;
    const { action } = req.body; // 'pause' or 'resume'

    const volunteer = await volunteerService.toggleVolunteerStatus(userId, { action });

    return res.status(200).json({ 
      message: action === 'pause' ? 'Successfully paused activity.' : 'Successfully switched to ready state.',
      volunteer
    });

  } catch (error) {
    console.error('Error in toggleVolunteerStatus:', error);
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Server error while updating activity status.' });
  }
};

// Cancel registration request / Withdraw from Volunteer role
exports.cancelVolunteerRegistration = async (req, res) => {
  try {
    const userId = req.user._id;

    const volunteer = await volunteerService.cancelVolunteerRegistration(userId);

    return res.status(200).json({ message: 'Successfully withdrew from Rescue Team. System is revoking coordination rights.', volunteer });
  } catch (error) {
    console.error('Error in cancelVolunteerRegistration:', error);
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Server error while cancelling request/withdrawing from system.' });
  }
};
