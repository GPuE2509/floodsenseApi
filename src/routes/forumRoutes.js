const express = require('express');
const router = express.Router();
const { authenticateUser, authenticateUserOptional, authorizeRoles } = require('../middlewares/authMiddleware');
const forumController = require('../controllers/forum/forumController');

// Route: POST /api/forum/posts (Create a new post, pending review)
router.post('/posts', authenticateUser, forumController.createPost);

// Route: POST /api/forum/posts/official (Create official pinned post)
router.post('/posts/official', authenticateUser, authorizeRoles('Admin', 'Manager'), forumController.createOfficialPinnedPost);

// Route: GET /api/forum/posts (Retrieve posts, optional status/my_posts filter)
router.get('/posts', authenticateUserOptional, forumController.getPosts);

// Route: PUT /api/forum/posts/:id (Update own post)
router.put('/posts/:id', authenticateUser, forumController.updatePost);

// Route: DELETE /api/forum/posts/:id (Delete post)
router.delete('/posts/:id', authenticateUser, forumController.deletePost);

// Route: PUT /api/forum/posts/:id/pin (Toggle pin post)
router.put('/posts/:id/pin', authenticateUser, authorizeRoles('Admin', 'Manager'), forumController.togglePinPost);

// Route: POST /api/forum/posts/:id/react (Like/Heart post)
router.post('/posts/:id/react', authenticateUser, forumController.reactPost);

// Route: POST /api/forum/posts/:id/comments (Create comment/reply)
router.post('/posts/:id/comments', authenticateUser, forumController.createComment);

// Route: DELETE /api/forum/comments/:id (Delete comment)
router.delete('/comments/:id', authenticateUser, forumController.deleteComment);

// Route: PUT /api/forum/comments/:id (Update comment)
router.put('/comments/:id', authenticateUser, forumController.updateComment);

// Route: POST /api/forum/posts/:id/report (Report post)
router.post('/posts/:id/report', authenticateUser, forumController.reportPost);

// Route: POST /api/forum/comments/:id/report (Report comment)
router.post('/comments/:id/report', authenticateUser, forumController.reportComment);

// Moderation Routes
// View all forum posts
router.get('/posts/all', authenticateUser, authorizeRoles('Admin', 'Manager'), forumController.getAllPosts);

// View Reported Forum Posts (Dedicated API)
router.get('/posts/reported', authenticateUser, authorizeRoles('Admin', 'Manager'), forumController.getReportedPosts);

// Moderate Forum Posts Queue
router.put('/posts/:id/approve', authenticateUser, authorizeRoles('Admin', 'Manager'), forumController.approvePost);
router.put('/posts/:id/reject', authenticateUser, authorizeRoles('Admin', 'Manager'), forumController.rejectPost);
router.delete('/posts/:id/violation', authenticateUser, authorizeRoles('Admin', 'Manager'), forumController.deleteViolatingPost);
// Dismiss Forum Post Reports
router.delete('/posts/:id/reports', authenticateUser, authorizeRoles('Admin', 'Manager'), forumController.dismissReports);

// Comment Moderation Routes
// View Reported Comments (Legacy, kept for general view)
router.get('/comments/all', authenticateUser, authorizeRoles('Admin', 'Manager'), forumController.getAllComments);

// View Reported Comments (Dedicated API)
router.get('/comments/reported', authenticateUser, authorizeRoles('Admin', 'Manager'), forumController.getReportedComments);
router.delete('/comments/:id/violation', authenticateUser, authorizeRoles('Admin', 'Manager'), forumController.deleteViolatingComment);
// Dismiss Comment Reports
router.delete('/comments/:id/reports', authenticateUser, authorizeRoles('Admin', 'Manager'), forumController.dismissCommentReports);

module.exports = router;
