const express = require('express');
const router = express.Router();
const leaderboardController = require('../controllers/user/leaderboardController');

router.get('/', leaderboardController.getLeaderboard);
router.get('/rewards', leaderboardController.getRewards);
router.post('/snapshot', leaderboardController.triggerSnapshot);

module.exports = router;
