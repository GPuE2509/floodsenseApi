const analyticsReportService = require('../../services/admin/analyticsReportService');
const pdfReportService = require('../../services/admin/pdfReportService');
const excelLogService = require('../../services/admin/excelLogService');

/**
 * GET /api/admin/reports/export-pdf
 * Query params:
 *   dateFrom   - ISO date string  (default: 30 ngày trước)
 *   dateTo     - ISO date string  (default: hôm nay)
 *   sections   - comma-separated: overview,flood_history,rescue_distribution
 *   lang       - 'vi' | 'en'  (default: 'vi')
 *
 * Accessible by: Admin, Manager
 */
exports.exportAnalyticsPdf = async (req, res) => {
  try {
    const now = new Date();

    // ── Parse params ──
    const dateTo   = req.query.dateTo   ? new Date(req.query.dateTo)   : now;
    const dateFrom = req.query.dateFrom
      ? new Date(req.query.dateFrom)
      : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    if (isNaN(dateFrom.getTime()) || isNaN(dateTo.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid date format. Use ISO 8601 (e.g. 2026-01-01).' });
    }
    if (dateFrom > dateTo) {
      return res.status(400).json({ success: false, message: 'dateFrom must be before dateTo.' });
    }

    const rawSections = req.query.sections
      ? req.query.sections.split(',').map(s => s.trim()).filter(Boolean)
      : ['overview', 'flood_history', 'rescue_distribution'];

    const allowedSections = ['overview', 'flood_history', 'rescue_distribution'];
    const sections = rawSections.filter(s => allowedSections.includes(s));
    if (sections.length === 0) {
      return res.status(400).json({ success: false, message: `At least one valid section required: ${allowedSections.join(', ')}` });
    }

    const lang = ['vi', 'en'].includes(req.query.lang) ? req.query.lang : 'vi';

    // ── Exporter info ──
    const exporterInfo = {
      name: req.user.full_name || req.user.email || 'System User',
      role: req.user.role || 'Admin',
    };

    // ── Aggregate data ──
    const reportData = await analyticsReportService.generateAnalyticsData({
      dateFrom,
      dateTo,
      sections,
    });

    // ── Generate PDF buffer ──
    const pdfBuffer = await pdfReportService.generatePdfBuffer({
      reportData,
      exporterInfo,
      lang,
    });

    // ── Build filename ──
    const dateStr = now.toISOString().slice(0, 10);
    const langStr = lang === 'vi' ? 'vi' : 'en';
    const filename = `sftr-analytics-report-${dateStr}-${langStr}.pdf`;

    // ── Stream response ──
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Cache-Control', 'no-cache, no-store');
    res.end(pdfBuffer);

  } catch (error) {
    console.error('[exportAnalyticsPdf] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate analytics PDF report.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * GET /api/admin/reports/export-excel
 * Query params:
 *   dateFrom   - ISO date string  (default: 30 days ago)
 *   dateTo     - ISO date string  (default: today)
 *   streams    - comma-separated: sensory,incidents,rescues,system_logs
 *   logLevel   - ALL | WARNING | ERROR | CRITICAL
 *
 * Accessible by: Admin, Manager
 */
exports.exportRawLogsExcel = async (req, res) => {
  try {
    const now = new Date();
    const dateTo   = req.query.dateTo   ? new Date(req.query.dateTo)   : now;
    const dateFrom = req.query.dateFrom
      ? new Date(req.query.dateFrom)
      : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    if (isNaN(dateFrom.getTime()) || isNaN(dateTo.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid date format. Use ISO 8601 (e.g. 2026-01-01).' });
    }
    if (dateFrom > dateTo) {
      return res.status(400).json({ success: false, message: 'dateFrom must be before dateTo.' });
    }

    const rawStreams = req.query.streams
      ? req.query.streams.split(',').map(s => s.trim()).filter(Boolean)
      : ['sensory', 'incidents', 'rescues', 'system_logs'];

    const allowedStreams = ['sensory', 'incidents', 'rescues', 'system_logs'];
    const streams = rawStreams.filter(s => allowedStreams.includes(s));
    if (streams.length === 0) {
      return res.status(400).json({ success: false, message: `At least one valid data stream required: ${allowedStreams.join(', ')}` });
    }

    const logLevel = ['ALL', 'WARNING', 'ERROR', 'CRITICAL'].includes((req.query.logLevel || '').toUpperCase())
      ? req.query.logLevel.toUpperCase()
      : 'ALL';

    const lang = req.query.lang === 'vi' ? 'vi' : 'en';

    const exporterInfo = {
      name: req.user.full_name || req.user.email || 'System User',
      role: req.user.role || 'Admin',
    };

    const excelBuffer = await excelLogService.generateExcelWorkbook({
      dateFrom,
      dateTo,
      streams,
      logLevel,
      exporterInfo,
      lang,
    });

    const dateStr = now.toISOString().slice(0, 10);
    const filename = `sftr-raw-system-logs-${dateStr}-${lang}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', excelBuffer.length);
    res.setHeader('Cache-Control', 'no-cache, no-store');
    res.end(excelBuffer);

  } catch (error) {
    console.error('[exportRawLogsExcel] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate raw system logs Excel file.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

