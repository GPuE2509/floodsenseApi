const express = require('express');
const router = express.Router();
const warningZoneController = require('../controllers/user/warningZoneController');
const { authenticateUser } = require('../middlewares/authMiddleware');

router.get('/', authenticateUser, warningZoneController.getWarningZones);
router.post('/', authenticateUser, warningZoneController.createWarningZone);
router.put('/:id', authenticateUser, warningZoneController.updateWarningZone);
router.delete('/:id', authenticateUser, warningZoneController.deleteWarningZone);

module.exports = router;
