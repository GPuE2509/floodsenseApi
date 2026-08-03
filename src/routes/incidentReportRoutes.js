const express = require('express');
const router = express.Router();
const incidentReportController = require('../controllers/report/incidentReportController');

// GET /api/incident-reports/new-count
router.get('/new-count', incidentReportController.getNewCount);

// POST /api/incident-reports
router.post('/', incidentReportController.createReport);

// GET /api/incident-reports
router.get('/', incidentReportController.getReports);

// GET /api/incident-reports/processing-logs
router.get('/processing-logs', incidentReportController.getIncidentProcessingLogs);

// GET /api/incident-reports/:id
router.get('/:id', incidentReportController.getReportById);

// POST /api/incident-reports/:id/vote
router.post('/:id/vote', incidentReportController.voteReport);

// PUT /api/incident-reports/:id/status
router.put('/:id/status', incidentReportController.updateReportStatus);

module.exports = router;
