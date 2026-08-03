const express = require('express');
const router = express.Router();
const volunteerAccountController = require('../controllers/volunteer/accountController');
const volunteerProfileController = require('../controllers/volunteer/profileController');
const { authenticateUser } = require('../middlewares/authMiddleware');
const { uploadSingleImage } = require('../utils/multerConfig');

// Register a new volunteer profile
router.post('/register', authenticateUser, uploadSingleImage, volunteerAccountController.registerVolunteerProfile);

// Get all active volunteers (status Available/Busy)
router.get('/active', authenticateUser, volunteerProfileController.getActiveVolunteers);

// Get volunteer profile of current user
router.get('/me', authenticateUser, volunteerProfileController.getVolunteerProfile);

// Toggle volunteer status (pause/resume)
router.put('/me/status', authenticateUser, volunteerAccountController.toggleVolunteerStatus);

// Cancel volunteer registration
router.put('/me/cancel', authenticateUser, volunteerAccountController.cancelVolunteerRegistration);

// Update volunteer profile
router.put('/me', authenticateUser, uploadSingleImage, volunteerProfileController.updateVolunteerProfile);

// Update volunteer location
router.put('/me/location', authenticateUser, volunteerProfileController.updateVolunteerLocation);

module.exports = router;
