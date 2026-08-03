const workshopService = require('../../services/workshop/accountService');

// Register new workshop
exports.registerWorkshopProfile = async (req, res) => {
  try {
    const workshop = await workshopService.registerWorkshop(req.user._id, req.body);
    
    const wsHelper = require('../../utils/wsHelper');
    wsHelper.broadcast({ type: 'MAP_UPDATE' });

    return res.status(201).json({
      message: 'Workshop registration successful. Pending approval.',
      workshop
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ message: messages.join(', ') });
    }
    return res.status(500).json({ message: 'Server error while registering workshop.' });
  }
};

// Cancel workshop registration request
exports.cancelWorkshopRegistration = async (req, res) => {
  try {
    await workshopService.cancelWorkshopRegistration(req.user._id);
    const wsHelper = require('../../utils/wsHelper');
    wsHelper.broadcast({ type: 'MAP_UPDATE' });

    return res.status(200).json({ message: 'Workshop registration request cancelled successfully.' });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Server error while cancelling workshop registration request.' });
  }
};

// Pause or resume workshop activity
exports.toggleWorkshopStatus = async (req, res) => {
  try {
    const workshop = await workshopService.toggleWorkshopStatus(req.user._id, req.body);
    const wsHelper = require('../../utils/wsHelper');
    wsHelper.broadcast({ type: 'MAP_UPDATE' });

    return res.status(200).json({
      message: req.body.action === 'pause' ? 'Workshop activity paused successfully.' : 'Workshop activity resumed successfully.',
      workshop
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Server error while updating workshop activity status.' });
  }
};
