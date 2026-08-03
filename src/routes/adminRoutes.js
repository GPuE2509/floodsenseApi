const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin/accountController');
const configController = require('../controllers/admin/configController');
const analyticsReportController = require('../controllers/admin/analyticsReportController');
const { authenticateUser, authorizeRoles } = require('../middlewares/authMiddleware');

// Route configurations
router.get('/users', authenticateUser, authorizeRoles('Admin', 'Manager'), adminController.getAllUsers);
router.get('/users/growth-metrics', authenticateUser, authorizeRoles('Admin'), adminController.getUserGrowthMetrics);
router.get('/system-logs', authenticateUser, authorizeRoles('Admin'), adminController.getSystemLogs);
router.delete('/system-logs/:id', authenticateUser, authorizeRoles('Admin'), adminController.deleteSystemLog);
router.put('/config', authenticateUser, authorizeRoles('Admin', 'Manager'), configController.updateConfig);
router.patch('/users/:id/role', authenticateUser, authorizeRoles('Admin'), adminController.updateUserRole);
router.patch('/users/:id/status', authenticateUser, authorizeRoles('Admin', 'Manager'), adminController.updateUserStatus);

// Role Upgrade Requests
router.get('/role-requests', authenticateUser, authorizeRoles('Admin', 'Manager'), adminController.getRoleRequests);
router.put('/role-requests/:id', authenticateUser, authorizeRoles('Admin', 'Manager'), adminController.handleRoleRequest);

// Contribution Points & Rewards Policy
const policyController = require('../controllers/admin/adminPolicyController');
router.get('/points-config', authenticateUser, authorizeRoles('Admin', 'Manager'), policyController.getPointsConfig);
router.put('/points-config', authenticateUser, authorizeRoles('Admin'), policyController.updatePointsConfig);

router.get('/rewards', authenticateUser, authorizeRoles('Admin', 'Manager'), policyController.getRewards);
router.post('/rewards', authenticateUser, authorizeRoles('Admin'), policyController.createReward);
router.put('/rewards/:id', authenticateUser, authorizeRoles('Admin'), policyController.updateReward);
router.delete('/rewards/:id', authenticateUser, authorizeRoles('Admin'), policyController.deleteReward);
router.post('/rewards/:id/send', authenticateUser, authorizeRoles('Admin', 'Manager'), policyController.sendReward);

// System Notifications
const notificationController = require('../controllers/user/notificationController');
router.post('/notifications/dispatch', authenticateUser, authorizeRoles('Admin', 'Manager'), notificationController.dispatchSystemNotification);

// Analytics & Raw Logs Export — PDF & Excel
router.get('/reports/export-pdf', authenticateUser, authorizeRoles('Admin', 'Manager'), analyticsReportController.exportAnalyticsPdf);
router.get('/reports/export-excel', authenticateUser, authorizeRoles('Admin', 'Manager'), analyticsReportController.exportRawLogsExcel);

// Configure Data Retention & Archiving Schedules (Strictly Role: Admin only)
const dataRetentionController = require('../controllers/admin/dataRetentionController');
router.get('/data-retention/policy', authenticateUser, authorizeRoles('Admin'), dataRetentionController.getPolicyAndStats);
router.put('/data-retention/policy', authenticateUser, authorizeRoles('Admin'), dataRetentionController.updatePolicy);
router.post('/data-retention/run-now', authenticateUser, authorizeRoles('Admin'), dataRetentionController.runEmergencyCleanUp);
router.get('/data-retention/logs', authenticateUser, authorizeRoles('Admin'), dataRetentionController.getArchiveLogs);
router.get('/data-retention/download/:filename', authenticateUser, authorizeRoles('Admin'), dataRetentionController.downloadArchiveFile);

module.exports = router;

