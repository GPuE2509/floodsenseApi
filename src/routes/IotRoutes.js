const express = require('express');
const router = express.Router();
const IotController = require('../controllers/iot/IotController');

const { uploadSingleImage } = require('../utils/multerConfig');
const { authenticateUser, authorizeRoles } = require('../middlewares/authMiddleware');

// Route: GET /api/iot/config
router.get('/config', IotController.getSystemConfig);

// Route: GET /api/iot/devices
router.get('/devices', IotController.getAllDevices);

// Route: POST /api/iot/devices
router.post('/devices', authenticateUser, authorizeRoles('Admin'), uploadSingleImage, IotController.addDevice);

// Route: GET /api/iot/devices/:id/history
router.get('/devices/:id/history', IotController.getDeviceHistory);

// Route: GET /api/iot/devices/:id/speed-analysis
router.get('/devices/:id/speed-analysis', IotController.getDeviceSpeedAnalysis);

// Route: GET /api/iot/devices/:id/logs
router.get('/devices/:id/logs', IotController.getDeviceLogs);

// Route: GET /api/iot/devices/:id
router.get('/devices/:id', IotController.getDeviceDetails);

// Route: PUT /api/iot/devices/:id
router.put('/devices/:id', authenticateUser, authorizeRoles('Admin'), uploadSingleImage, IotController.updateDevice);

// Route: POST /api/iot/gps (or /gps if mounted at root)
router.post('/gps', IotController.receiveTelemetry);

// Route: PATCH /api/iot/devices/:id/disable  — toggle is_disabled
router.patch('/devices/:id/disable', authenticateUser, authorizeRoles('Admin'), IotController.toggleDisable);

module.exports = router;
