const express = require('express');
const router = express.Router();
const rescueController = require('../controllers/rescue/rescueController');
const { authenticateUser } = require('../middlewares/authMiddleware');

// Route to create a new rescue request (SOS)
router.post('/', authenticateUser, rescueController.createRescueRequest);

// Route to get active rescue requests for volunteer
router.get('/', authenticateUser, rescueController.getActiveRescueRequests);
router.get('/active', authenticateUser, rescueController.getActiveRescueRequests);

// Temporary test dump endpoint
router.get('/test-dump', async (req, res) => {
  try {
    const RescueSession = require('../models/RescueSession');
    const sessions = await RescueSession.find({}).lean();
    return res.status(200).json(sessions);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Route to accept a pending rescue request (volunteer only)
router.put('/:id/accept', authenticateUser, rescueController.acceptRescueRequest);

// Route to cancel a rescue request (requester only)
router.put('/:id/cancel', authenticateUser, rescueController.cancelRescueRequest);

// Route to confirm safety of the victim (requester only)
router.put('/:id/safe', authenticateUser, rescueController.confirmSafety);

// Route to start moving to a rescue request (volunteer only)
router.put('/:id/start', authenticateUser, rescueController.startRescueRequest);

// Route to mark arrival at rescue scene (volunteer only)
router.put('/:id/arrive', authenticateUser, rescueController.arriveRescueRequest);

// Route to complete a rescue request (volunteer only)
router.put('/:id/complete', authenticateUser, rescueController.completeRescueRequest);

// Route to get current user's history of rescue requests (SOS + Mobile Repair)
router.get('/my-history', authenticateUser, rescueController.getMyRescueHistory);

// Route to get current user's active rescue request
// Route to get active rescue requests
router.get('/current', authenticateUser, rescueController.getCurrentRescueRequest);

// Route to get rescue requests for workshop owner/staff
router.get('/workshop', authenticateUser, rescueController.getWorkshopRescueSessions);

// Route to get a single rescue request details by ID
router.get('/:id', authenticateUser, rescueController.getRescueRequestById);

// Route to assign workshop staff to a request
router.put('/:id/assign-staff', authenticateUser, rescueController.assignWorkshopStaff);

// Route to confirm payment of a rescue request
router.put('/:id/confirm-payment', authenticateUser, rescueController.confirmPayment);

module.exports = router;
