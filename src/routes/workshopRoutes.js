const express = require('express');
const router = express.Router();
const workshopAccountController = require('../controllers/workshop/accountController');
const workshopProfileController = require('../controllers/workshop/profileController');
const reviewController = require('../controllers/workshop/reviewController');
const staffController = require('../controllers/workshop/staffController');
const { authenticateUser } = require('../middlewares/authMiddleware');
const { uploadSingleImage, uploadMultipleImages } = require('../utils/multerConfig');

// Register a new workshop profile
router.post('/register', authenticateUser, workshopAccountController.registerWorkshopProfile);

// Get workshop profile of current user
router.get('/me', authenticateUser, workshopProfileController.getWorkshopProfile);

// Update workshop profile of current user
router.put('/me', authenticateUser, workshopProfileController.updateWorkshopProfile);

// Add a new service to workshop
router.post('/me/services', authenticateUser, workshopProfileController.addService);

// Update an existing service in workshop
router.put('/me/services/:serviceId', authenticateUser, workshopProfileController.updateService);

// Delete a service from workshop
router.delete('/me/services/:serviceId', authenticateUser, workshopProfileController.deleteService);

// Cancel workshop registration request
router.put('/me/cancel', authenticateUser, workshopAccountController.cancelWorkshopRegistration);

// Toggle workshop status (pause/resume)
router.put('/me/status', authenticateUser, workshopAccountController.toggleWorkshopStatus);

// Upload cover photo for workshop
router.put('/me/cover-photo', authenticateUser, uploadSingleImage, workshopProfileController.uploadCoverPhoto);

// Reviews for a specific workshop
router.get('/:id/reviews', reviewController.getWorkshopReviews);
router.post('/:id/reviews', authenticateUser, uploadMultipleImages, reviewController.createWorkshopReview);
router.post('/:id/reviews/:reviewId/respond', authenticateUser, reviewController.respondToReview);
router.put('/:id/reviews/:reviewId/respond', authenticateUser, reviewController.respondToReview);
router.post('/:id/reviews/:reviewId/reply', authenticateUser, reviewController.respondToReview);
router.put('/:id/reviews/:reviewId/reply', authenticateUser, reviewController.respondToReview);
router.delete('/:id/reviews/:reviewId/respond', authenticateUser, reviewController.deleteOwnerResponse);
router.delete('/:id/reviews/:reviewId/reply', authenticateUser, reviewController.deleteOwnerResponse);
router.delete('/:id/reviews/:reviewId', authenticateUser, reviewController.deleteWorkshopReview);

// --- Workshop Staff Management ---

// Owner views all their workshop staff
router.get('/me/staff', authenticateUser, staffController.getWorkshopStaff);

// Owner invites a user to the workshop
router.post('/me/staff/invite', authenticateUser, staffController.inviteStaff);

// Owner cancels an invitation
router.delete('/me/staff/:userId/invite', authenticateUser, staffController.cancelInvitation);

// Owner suspends/unsuspends a staff member
router.put('/me/staff/:userId/suspend', authenticateUser, staffController.toggleSuspendStaff);

// Owner fires/removes a staff member from the workshop
router.delete('/me/staff/:userId', authenticateUser, staffController.fireStaff);

// Update staff real-time location
router.put('/me/staff/location', authenticateUser, staffController.updateStaffLocation);

// --- Workshop Shift Management ---
const shiftController = require('../controllers/workshop/shiftController');
router.get('/me/shifts/templates', authenticateUser, shiftController.getShiftTemplates);
router.put('/me/shifts/templates/:templateId', authenticateUser, shiftController.updateShiftTemplate);
router.get('/me/shifts/weekly', authenticateUser, shiftController.getWeeklySchedule);
router.post('/me/shifts/weekly', authenticateUser, shiftController.saveWeeklySchedule);

// User views their own invitations
router.get('/staff/invitations', authenticateUser, staffController.getMyInvitations);

// User accepts an invitation
router.put('/staff/invitations/:id/accept', authenticateUser, staffController.acceptInvitation);

// User declines an invitation
router.put('/staff/invitations/:id/decline', authenticateUser, staffController.declineInvitation);

// Get all active workshops (public)
router.get('/', workshopProfileController.getAllWorkshops);

// Get a workshop by ID (public, for detail view)
router.get('/:id', workshopProfileController.getWorkshopById);

module.exports = router;
