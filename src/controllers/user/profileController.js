const profileService = require('../../services/user/profileService');

exports.getProfile = async (req, res) => {
  try {
    const profileData = await profileService.getUserProfile(req.user);
    return res.status(200).json(profileData);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error('Error in GET profile controller:', error);
    return res.status(500).json({ message: 'Server error while fetching profile.' });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const updatedUser = await profileService.updateUserProfile(req.user._id, req.body);
    return res.status(200).json({
      message: 'Profile updated successfully.',
      user: updatedUser
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ message: messages.join(', ') });
    }
    console.error('Error in PUT profile controller:', error);
    return res.status(500).json({ message: 'Server error while updating profile.' });
  }
};

exports.updateAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const avatar_url = await profileService.updateUserAvatar(req.user, req.file.buffer);

    return res.status(200).json({
      message: 'Avatar updated successfully.',
      avatar_url
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error('Error in PUT avatar controller:', error);
    return res.status(500).json({ message: error.message || 'Server error while updating avatar.' });
  }
};

exports.deleteAvatar = async (req, res) => {
  try {
    const avatar_url = await profileService.deleteUserAvatar(req.user);
    return res.status(200).json({
      message: 'Avatar deleted successfully.',
      avatar_url
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error('Error in DELETE avatar controller:', error);
    return res.status(500).json({ message: 'Server error while deleting avatar.' });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const token = req.cookies?.token || req.header('Authorization')?.split(' ')[1];

    await profileService.changeUserPassword(req.user._id, currentPassword, newPassword, token);

    res.clearCookie('token');

    return res.status(200).json({ message: 'Password changed successfully.' });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error('Error in changePassword controller:', error);
    return res.status(500).json({ message: 'Server error while changing password.' });
  }
};

exports.claimDailyPoints = async (req, res) => {
  try {
    const role = (req.user.role || '').toLowerCase();
    if (role === 'admin' || role === 'manager') {
      return res.status(403).json({ message: 'Admins and managers cannot claim daily points.' });
    }
    const result = await profileService.claimDailyPoints(req.user._id);
    return res.status(200).json(result);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error('Error in claimDailyPoints controller:', error);
    return res.status(500).json({ message: 'Server error while claiming daily points.' });
  }
};
