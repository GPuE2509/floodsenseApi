const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/user/notificationController');
const { authenticateUser } = require('../middlewares/authMiddleware');

router.get('/public/broadcasts', notificationController.getPublicBroadcasts);
router.get('/', authenticateUser, notificationController.getNotifications);
router.get('/preferences', authenticateUser, notificationController.getPreferences);
router.put('/preferences', authenticateUser, notificationController.updatePreferences);
router.patch('/:id/read', authenticateUser, notificationController.markAsRead);
router.put('/:id/read', authenticateUser, notificationController.markAsRead); // Support PUT for mobile compatibility
router.post('/read-all', authenticateUser, notificationController.markAllRead);
router.put('/read-all', authenticateUser, notificationController.markAllRead); // Support PUT for mobile compatibility

module.exports = router;
