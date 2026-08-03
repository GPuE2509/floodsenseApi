const warningZoneService = require('../../services/user/warningZoneService');

exports.getWarningZones = async (req, res) => {
  try {
    const userId = req.user._id;
    const zones = await warningZoneService.getWarningZones(userId);
    return res.status(200).json({ success: true, data: zones });
  } catch (error) {
    console.error('Error fetching warning zones:', error);
    return res.status(500).json({ success: false, message: 'Server error while fetching warning zones.' });
  }
};

exports.createWarningZone = async (req, res) => {
  try {
    const userId = req.user._id;
    const zone = await warningZoneService.createWarningZone(userId, req.body);
    return res.status(201).json({ success: true, data: zone });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    console.error('Error creating warning zone:', error);
    return res.status(500).json({ success: false, message: 'Server error while creating warning zone.' });
  }
};

exports.updateWarningZone = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const zone = await warningZoneService.updateWarningZone(userId, id, req.body);
    return res.status(200).json({ success: true, data: zone });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    console.error('Error updating warning zone:', error);
    return res.status(500).json({ success: false, message: 'Server error while updating warning zone.' });
  }
};

exports.deleteWarningZone = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    await warningZoneService.deleteWarningZone(userId, id);
    return res.status(200).json({ success: true, message: 'Warning zone deleted successfully.' });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    console.error('Error deleting warning zone:', error);
    return res.status(500).json({ success: false, message: 'Server error while deleting warning zone.' });
  }
};
