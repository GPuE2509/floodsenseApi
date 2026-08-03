const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chat/chatController');
const { authenticateUser } = require('../middlewares/authMiddleware');
const { uploadSingleImage } = require('../utils/multerConfig');

// User search for find friend feature
router.get('/users/search', authenticateUser, chatController.searchUsers);

// Get list of volunteer accounts for group chat creation
router.get('/volunteers', authenticateUser, chatController.getVolunteers);

// Load conversation list
router.get('/conversations', authenticateUser, chatController.getConversations);

// Load message history for a target
router.get('/history', authenticateUser, chatController.getChatHistory);

// Mark conversation messages as read
router.post('/read', authenticateUser, chatController.markAsRead);

// Send message via API
router.post('/send', authenticateUser, chatController.sendMessage);

// Upload chat image
router.post('/upload-image', authenticateUser, uploadSingleImage, chatController.uploadChatImage);

module.exports = router;
