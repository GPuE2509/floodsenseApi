const incidentReportService = require('../../services/report/incidentReportService');

/**
 * Create a new incident report
 */
exports.createReport = async (req, res) => {
  try {
    const savedReport = await incidentReportService.createReport(req.body);
    res.status(201).json({ success: true, data: savedReport });
  } catch (error) {
    console.error('Error creating report:', error);
    res.status(error.statusCode || 500).json({ 
      success: false, 
      message: error.message || 'Server Error', 
      error: error.message 
    });
  }
};

/**
 * Get all incident reports
 */
exports.getReports = async (req, res) => {
  try {
    const page = req.query.page ? parseInt(req.query.page) : undefined;
    const limit = parseInt(req.query.limit) || 5;

    const result = await incidentReportService.getReports({ page, limit });

    if (result.pagination) {
      return res.status(200).json({ 
        success: true, 
        data: result.reports,
        pagination: result.pagination 
      });
    } else {
      return res.status(200).json({ success: true, data: result.reports });
    }
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(error.statusCode || 500).json({ 
      success: false, 
      message: 'Server Error', 
      error: error.message 
    });
  }
};

/**
 * Get count of new reports since a timestamp
 */
exports.getNewCount = async (req, res) => {
  try {
    const { since } = req.query;
    const count = await incidentReportService.getNewCount(since);
    res.status(200).json({ success: true, count });
  } catch (error) {
    console.error('Error getting new count:', error);
    res.status(error.statusCode || 500).json({ 
      success: false, 
      message: 'Server Error', 
      error: error.message 
    });
  }
};

/**
 * Get a single incident report by ID
 */
exports.getReportById = async (req, res) => {
  try {
    const { id } = req.params;
    const report = await incidentReportService.getReportById(id);
    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }
    res.status(200).json({ success: true, data: report });
  } catch (error) {
    console.error('Error fetching report:', error);
    res.status(error.statusCode || 500).json({ 
      success: false, 
      message: 'Server Error', 
      error: error.message 
    });
  }
};

/**
 * Vote on an incident report
 */
exports.voteReport = async (req, res) => {
  try {
    const { id } = req.params;
    const { vote_type, user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ success: false, message: 'user_id is required' });
    }
    if (vote_type !== null && !['confirm', 'deny', 'false'].includes(vote_type)) {
      return res.status(400).json({ success: false, message: 'vote_type must be confirm, deny, false, or null to unvote' });
    }

    const { savedReport, distance_m } = await incidentReportService.voteReport(id, req.body);
    res.status(200).json({ success: true, data: savedReport, distance_m });
  } catch (error) {
    console.error('Error voting on report:', error);
    res.status(error.statusCode || 500).json({ 
      success: false, 
      message: error.message || 'Server Error', 
      error: error.message 
    });
  }
};

/**
 * Update incident report moderation status (Approve/Reject) or lifecycle status (Archive)
 */
exports.updateReportStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const report = await incidentReportService.updateReportStatus(id, req.body, req.user);
    res.status(200).json({ success: true, message: 'Report status updated', data: report });
  } catch (error) {
    console.error('Error updating report status:', error);
    res.status(error.statusCode || 500).json({ 
      success: false, 
      message: error.message || 'Server Error', 
      error: error.message 
    });
  }
};

/**
 * Get incident processing logs
 */
exports.getIncidentProcessingLogs = async (req, res) => {
  try {
    const result = await incidentReportService.getIncidentProcessingLogs();
    return res.status(200).json({
      success: true,
      summary: result.summary,
      data: result.data
    });
  } catch (error) {
    console.error('Error fetching incident processing logs:', error);
    return res.status(error.statusCode || 500).json({ 
      success: false, 
      message: 'Server Error', 
      error: error.message 
    });
  }
};
