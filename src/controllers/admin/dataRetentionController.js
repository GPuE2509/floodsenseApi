/**
 * dataRetentionController.js — Controller for Admin Data Retention & Archiving Management
 * Accessible strictly by: Role = 'Admin'
 */

const dataRetentionService = require('../../services/admin/dataRetentionService');
const fs = require('fs');

/**
 * GET /api/admin/data-retention/policy
 * Returns current retention policy settings + live MongoDB collection sizes & record counts
 */
exports.getPolicyAndStats = async (req, res) => {
  try {
    const data = await dataRetentionService.getPolicyAndStats();
    return res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    console.error('[dataRetentionController.getPolicyAndStats] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve data retention policy and statistics.'
    });
  }
};

/**
 * PUT /api/admin/data-retention/policy
 * Updates retention days and ON/OFF automatic monthly scheduler
 */
exports.updatePolicy = async (req, res) => {
  try {
    const userId = req.user?._id;
    const policy = await dataRetentionService.updatePolicy(req.body, userId);
    return res.status(200).json({
      success: true,
      message: 'Data retention policy updated successfully.',
      policy
    });
  } catch (error) {
    console.error('[dataRetentionController.updatePolicy] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update data retention policy.'
    });
  }
};

/**
 * POST /api/admin/data-retention/run-now
 * Emergency Manual Trigger: Executes immediate cold archiving & DB optimization regardless of ON/OFF toggle
 */
exports.runEmergencyCleanUp = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id || req.user?.userId || null;
    const logResult = await dataRetentionService.executeRetentionCleanUp({
      triggerType: 'Emergency_Manual',
      executedBy: userId
    });

    if (logResult.total_records_processed === 0) {
      return res.status(200).json({
        success: true,
        message: 'ℹ️ Chưa có bất kỳ loại dữ liệu nào vượt quá số ngày tuổi thọ định mức. Không có file lưu trữ lạnh nào được xuất ra.',
        logResult
      });
    }

    return res.status(200).json({
      success: true,
      message: `Emergency data cleanup completed. Processed ${logResult.total_records_processed} expired record(s).`,
      logResult
    });
  } catch (error) {
    console.error('[dataRetentionController.runEmergencyCleanUp] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to execute emergency data retention cleanup.'
    });
  }
};

/**
 * GET /api/admin/data-retention/logs
 * Retrieves audit history of all archiving runs & generated cold storage files
 */
exports.getArchiveLogs = async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit) : 30;
    const logs = await dataRetentionService.getArchiveLogs(limit);
    return res.status(200).json({
      success: true,
      logs
    });
  } catch (error) {
    console.error('[dataRetentionController.getArchiveLogs] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve data retention audit logs.'
    });
  }
};

/**
 * GET /api/admin/data-retention/download/:filename?format=xlsx
 * Downloads a compressed (.json.gz) archive file for machine/db inspection, OR formatted .XLSX for human reading when format=xlsx
 */
exports.downloadArchiveFile = async (req, res) => {
  try {
    const filename = req.params.filename;
    const format = req.query.format;

    const filepath = dataRetentionService.resolveArchiveFilePath(filename);
    if (!filepath) {
      return res.status(404).json({
        success: false,
        message: 'Archive file not found or invalid filename.'
      });
    }

    // If Excel human-readable format requested
    if (format === 'xlsx') {
      const xlsxBuffer = await dataRetentionService.generateArchiveExcel(filename);
      if (!xlsxBuffer) {
        return res.status(500).json({ success: false, message: 'Failed to generate Excel workbook from cold archive.' });
      }
      // Clean up filename: e.g. incidents-cold-archive-2026-07-16-1784189575941.json.gz -> SFTR_ColdArchive_INCIDENTS_2026-07-16.xlsx
      let cleanBase = filename.replace('.json.gz', '').replace('.gz', '').replace(/-\d{13}/, '');
      if (cleanBase.includes('-cold-archive-')) {
        const parts = cleanBase.split('-cold-archive-');
        cleanBase = `SFTR_ColdArchive_${parts[0].toUpperCase()}_${parts[1] || 'Batch'}`;
      }
      const xlsxFilename = `${cleanBase}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${xlsxFilename}"`);
      res.setHeader('Content-Length', xlsxBuffer.length);
      return res.end(xlsxBuffer);
    }

    // Default: Raw GZIP (.json.gz) download
    let cleanFilename = filename.replace(/-\d{13}/, '');
    if (cleanFilename.includes('-cold-archive-')) {
      const parts = cleanFilename.replace('.json.gz', '').split('-cold-archive-');
      cleanFilename = `SFTR_ColdArchive_${parts[0].toUpperCase()}_${parts[1] || 'Batch'}.json.gz`;
    }
    const stat = fs.statSync(filepath);
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${cleanFilename}"`);
    res.setHeader('Content-Length', stat.size);
    
    const readStream = fs.createReadStream(filepath);
    readStream.pipe(res);
  } catch (error) {
    console.error('[dataRetentionController.downloadArchiveFile] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to download compressed archive file.'
    });
  }
};
