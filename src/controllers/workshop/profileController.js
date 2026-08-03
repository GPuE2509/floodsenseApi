const workshopService = require('../../services/workshop/profileService');

// Get workshop info of current user (to display status)
exports.getWorkshopProfile = async (req, res) => {
  try {
    const workshop = await workshopService.getWorkshop(req.user);
    return res.status(200).json({ workshop });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Server error while fetching workshop information.' });
  }
};

// Update workshop profile information
exports.updateWorkshopProfile = async (req, res) => {
  try {
    const workshop = await workshopService.updateWorkshop(req.user._id, req.body);
    const wsHelper = require('../../utils/wsHelper');
    wsHelper.broadcast({ type: 'MAP_UPDATE' });

    return res.status(200).json({
      message: 'Workshop information updated successfully.',
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
    return res.status(500).json({ message: 'Server error while updating workshop information.' });
  }
};

// Add new service to workshop
exports.addService = async (req, res) => {
  try {
    const workshop = await workshopService.addService(req.user._id, req.body);
    const wsHelper = require('../../utils/wsHelper');
    wsHelper.broadcast({ type: 'MAP_UPDATE' });

    return res.status(200).json({
      message: 'Service added successfully.',
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
    return res.status(500).json({ message: 'Server error while adding service.' });
  }
};

// Update an existing service in workshop
exports.updateService = async (req, res) => {
  try {
    const workshop = await workshopService.updateService(req.user._id, req.params.serviceId, req.body);
    const wsHelper = require('../../utils/wsHelper');
    wsHelper.broadcast({ type: 'MAP_UPDATE' });

    return res.status(200).json({
      message: 'Service updated successfully.',
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
    return res.status(500).json({ message: 'Server error while updating service.' });
  }
};

// Delete a service from workshop
exports.deleteService = async (req, res) => {
  try {
    const workshop = await workshopService.deleteService(req.user._id, req.params.serviceId);
    const wsHelper = require('../../utils/wsHelper');
    wsHelper.broadcast({ type: 'MAP_UPDATE' });

    return res.status(200).json({
      success: true,
      message: 'Service deleted successfully.',
      workshop
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Server error while deleting service.' });
  }
};

exports.uploadCoverPhoto = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const cover_url = await workshopService.updateCoverPhoto(req.user._id, req.file.buffer);

    const wsHelper = require('../../utils/wsHelper');
    wsHelper.broadcast({ type: 'MAP_UPDATE' });

    return res.status(200).json({
      message: 'Workshop cover image updated successfully.',
      cover_url
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error('Error in PUT workshop cover-photo controller:', error);
    return res.status(500).json({ message: error.message || 'Server error while updating workshop cover image.' });
  }
};

// Get a single workshop by ID (public endpoint for detail view)
exports.getWorkshopById = async (req, res) => {
  try {
    const { id } = req.params;
    const data = await workshopService.getWorkshopById(id);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    console.error('Error in GET /workshops/:id:', error);
    return res.status(500).json({ success: false, message: 'Server error while fetching workshop details.' });
  }
};

// Get all active workshops
exports.getAllWorkshops = async (req, res) => {
  try {
    const { lat, lng } = req.query;
    if (lat !== undefined && lng !== undefined) {
      const workshops = await workshopService.getMobileWorkshopsInRadius(lat, lng);
      return res.status(200).json({ success: true, data: workshops });
    }

    const mapService = require('../../services/map/mapService');
    const workshops = await mapService.getActiveWorkshops();
    return res.status(200).json({ success: true, data: workshops });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    console.error('Error in GET /workshops:', error);
    return res.status(500).json({ success: false, message: 'Server error while fetching active workshops.' });
  }
};
