const warningRoadService = require('../../services/user/warningRoadService');

exports.getWarningRoads = async (req, res) => {
  try {
    const userId = req.user._id;
    const roads = await warningRoadService.getWarningRoads(userId);
    return res.status(200).json({ success: true, data: roads });
  } catch (error) {
    console.error('Error fetching warning roads:', error);
    return res.status(500).json({ success: false, message: 'Server error while fetching warning roads.' });
  }
};

exports.createWarningRoad = async (req, res) => {
  try {
    const userId = req.user._id;
    const road = await warningRoadService.createWarningRoad(userId, req.body);
    return res.status(201).json({ success: true, data: road });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    console.error('Error creating warning road:', error);
    return res.status(500).json({ success: false, message: 'Server error while creating warning road.' });
  }
};

exports.updateWarningRoad = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const road = await warningRoadService.updateWarningRoad(userId, id, req.body);
    return res.status(200).json({ success: true, data: road });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    console.error('Error updating warning road:', error);
    return res.status(500).json({ success: false, message: 'Server error while updating warning road.' });
  }
};

exports.deleteWarningRoad = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    await warningRoadService.deleteWarningRoad(userId, id);
    return res.status(200).json({ success: true, message: 'Warning road deleted successfully.' });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    console.error('Error deleting warning road:', error);
    return res.status(500).json({ success: false, message: 'Server error while deleting warning road.' });
  }
};
