//src\routes\warningRoadRoutes.js
const express = require('express');
const router = express.Router();
const warningRoadController = require('../controllers/user/warningRoadController');
const { authenticateUser } = require('../middlewares/authMiddleware');

router.get('/', authenticateUser, warningRoadController.getWarningRoads);
router.post('/', authenticateUser, warningRoadController.createWarningRoad);
router.put('/:id', authenticateUser, warningRoadController.updateWarningRoad);
router.delete('/:id', authenticateUser, warningRoadController.deleteWarningRoad);

module.exports = router;
