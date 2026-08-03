const express = require('express');
const router = express.Router();
const emergencyGuidelineController = require('../controllers/admin/emergencyGuidelineController');
const { authenticateUser, authorizeRoles } = require('../middlewares/authMiddleware');

// Public route for mobile apps to fetch
router.get('/', emergencyGuidelineController.getAllGuidelines);

// Protected routes for manager/admin to edit
router.get('/admin', authenticateUser, authorizeRoles('Admin', 'Manager'), emergencyGuidelineController.getAllGuidelinesAdmin);

// Feature Add Emergency Guideline
router.post('/', authenticateUser, authorizeRoles('Admin', 'Manager'), emergencyGuidelineController.createGuideline);

// Feature Update Emergency Guideline
router.put('/:id', authenticateUser, authorizeRoles('Admin', 'Manager'), emergencyGuidelineController.updateGuideline);

// Feature Delete Emergency Guideline
router.delete('/:id', authenticateUser, authorizeRoles('Admin', 'Manager'), emergencyGuidelineController.deleteGuideline);

module.exports = router;