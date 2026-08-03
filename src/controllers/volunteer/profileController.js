const volunteerService = require('../../services/volunteer/profileService');

// Get volunteer profile of current user
exports.getVolunteerProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const volunteer = await volunteerService.getVolunteerProfile(userId);

    return res.status(200).json({ volunteer });
  } catch (error) {
    console.error('Error in getVolunteerProfile:', error);
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Server error while fetching Volunteer profile.' });
  }
};

// Update volunteer profile information
exports.updateVolunteerProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const volunteer = await volunteerService.updateVolunteerProfile(userId, req.body, req.file);

    return res.status(200).json({
      message: 'Vehicle information updated successfully.',
      volunteer
    });

  } catch (error) {
    console.error('Error in updateVolunteerProfile:', error);
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ message: messages.join(', ') });
    }
    return res.status(500).json({ message: 'Server error while updating Volunteer profile.' });
  }
};

// Update volunteer location
exports.updateVolunteerLocation = async (req, res) => {
  try {
    const userId = req.user._id;
    const { lat, lng } = req.body;

    if (lat == null || lng == null) {
      return res.status(400).json({ message: 'Latitude and Longitude are required.' });
    }

    const volunteer = await volunteerService.updateVolunteerLocation(userId, { lat, lng });

    return res.status(200).json({
      message: 'Location updated successfully.',
      volunteer
    });
  } catch (error) {
    console.error('Error in updateVolunteerLocation controller:', error);
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Server error while updating Volunteer location.' });
  }
};

exports.getActiveVolunteers = async (req, res) => {
  try {
    const activeVolunteers = await volunteerService.getActiveVolunteers();
    return res.status(200).json({
      success: true,
      data: activeVolunteers
    });
  } catch (error) {
    console.error('Error in getActiveVolunteers controller:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching active volunteers.',
      error: error.message
    });
  }
};

