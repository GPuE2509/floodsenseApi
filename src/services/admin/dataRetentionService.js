/**
 * dataRetentionService.js — SFTR System Data Retention & Cold Archiving Engine
 *
 * FUNCTIONS:
 * 1. getPolicy & DB Health Metrics: Retrieves retention policies and real-time MongoDB record counts.
 * 2. updatePolicy: Toggles ON/OFF for automatic monthly archiving (01:00 AM on day 1) and custom retention days.
 * 3. executeRetentionCleanUp (Cold Archiving & Purging):
 *    - Extracts expired sensory logs, incident reports, and system audit logs.
 *    - Compresses them into standard `.json.gz` (GZIP compressed JSON) cold storage archives saving ~90% disk space.
 *    - Permanently purges (`deleteMany`) the archived records from the active MongoDB collections to boost speed.
 * 4. File Management: Verifies and serves compressed `.json.gz` files for instant administrative download.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const ExcelJS = require('exceljs');
const DataRetentionPolicy = require('../../models/DataRetentionPolicy');
const DataRetentionLog = require('../../models/DataRetentionLog');
const WaterLevelLog = require('../../models/WaterLevelLog');
const IncidentReport = require('../../models/IncidentReport');
const SystemLog = require('../../models/SystemLog');
const RescueSession = require('../../models/RescueSession');

const ARCHIVE_DIR = path.join(__dirname, '../../../storage/archives');

// Ensure archive storage directory exists
if (!fs.existsSync(ARCHIVE_DIR)) {
  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
}

/**
 * Get current retention policy and real-time MongoDB health statistics
 */
exports.getPolicyAndStats = async () => {
  let policy = await DataRetentionPolicy.findOne();
  if (!policy) {
    policy = await DataRetentionPolicy.create({
      auto_archive_enabled: false,
      schedule_cron: '0 1 1 * *',
      sensory_retention_days: 90,
      incidents_retention_days: 180,
      system_logs_retention_days: 180,
      rescues_retention_days: 365,
    });
  }

  // Fetch concurrent record counts from Mongoose models
  const [sensoryCount, incidentsCount, systemLogsCount, rescuesCount] = await Promise.all([
    WaterLevelLog.countDocuments(),
    IncidentReport.countDocuments(),
    SystemLog.countDocuments(),
    RescueSession.countDocuments(),
  ]);

  // Estimate storage sizes based on typical BSON document footprint
  const sensorySizeMb    = parseFloat(((sensoryCount * 180) / (1024 * 1024)).toFixed(2)); // ~180 bytes per sensory log
  const incidentsSizeMb  = parseFloat(((incidentsCount * 1200) / (1024 * 1024)).toFixed(2)); // ~1.2 KB per incident
  const systemLogsSizeMb = parseFloat(((systemLogsCount * 320) / (1024 * 1024)).toFixed(2)); // ~320 bytes per system log
  const rescuesSizeMb    = parseFloat(((rescuesCount * 900) / (1024 * 1024)).toFixed(2)); // ~900 bytes per rescue session

  return {
    policy,
    stats: {
      sensory: { count: sensoryCount, estimated_mb: sensorySizeMb },
      incidents: { count: incidentsCount, estimated_mb: incidentsSizeMb },
      system_logs: { count: systemLogsCount, estimated_mb: systemLogsSizeMb },
      rescues: { count: rescuesCount, estimated_mb: rescuesSizeMb },
      total_records: sensoryCount + incidentsCount + systemLogsCount + rescuesCount,
      total_estimated_mb: parseFloat((sensorySizeMb + incidentsSizeMb + systemLogsSizeMb + rescuesSizeMb).toFixed(2))
    }
  };
};

/**
 * Update system-wide retention policy and toggle automatic schedule ON/OFF
 */
exports.updatePolicy = async (updates, userId) => {
  let policy = await DataRetentionPolicy.findOne();
  if (!policy) {
    policy = new DataRetentionPolicy();
  }

  if (typeof updates.auto_archive_enabled === 'boolean') {
    policy.auto_archive_enabled = updates.auto_archive_enabled;
  }
  if (typeof updates.sensory_retention_days === 'number' && updates.sensory_retention_days >= 7) {
    policy.sensory_retention_days = updates.sensory_retention_days;
  }
  if (typeof updates.incidents_retention_days === 'number' && updates.incidents_retention_days >= 7) {
    policy.incidents_retention_days = updates.incidents_retention_days;
  }
  if (typeof updates.system_logs_retention_days === 'number' && updates.system_logs_retention_days >= 7) {
    policy.system_logs_retention_days = updates.system_logs_retention_days;
  }
  if (typeof updates.rescues_retention_days === 'number' && updates.rescues_retention_days >= 7) {
    policy.rescues_retention_days = updates.rescues_retention_days;
  }

  policy.updated_by = userId || null;
  policy.updated_at = new Date();
  await policy.save();

  return policy;
};

/**
 * Execute Cold Archiving & Purging routine across all data streams
 */
exports.executeRetentionCleanUp = async ({ triggerType = 'Emergency_Manual', executedBy = null }) => {
  const startTime = new Date();
  const policy = await DataRetentionPolicy.findOne() || await exports.getPolicyAndStats().then(r => r.policy);

  // Initialize audit log
  const logEntry = await DataRetentionLog.create({
    trigger_type: triggerType,
    executed_by: executedBy,
    start_time: startTime,
    status: 'Running',
    results: []
  });

  let totalRecordsProcessed = 0;
  let totalBytesSaved = 0;
  const results = [];

  const streamConfigs = [
    {
      stream: 'sensory',
      model: WaterLevelLog,
      dateField: 'timestamp',
      retentionDays: policy.sensory_retention_days || 90,
      extraQuery: {}
    },
    {
      stream: 'incidents',
      model: IncidentReport,
      dateField: 'created_at',
      retentionDays: policy.incidents_retention_days || 180,
      extraQuery: { $or: [{ lifecycle_status: 'Archived' }, { moderation_status: { $in: ['Approved', 'Rejected'] } }] }
    },
    {
      stream: 'system_logs',
      model: SystemLog,
      dateField: 'timestamp',
      retentionDays: policy.system_logs_retention_days || 180,
      extraQuery: {}
    },
    {
      stream: 'rescues',
      model: RescueSession,
      dateField: 'created_at',
      retentionDays: policy.rescues_retention_days || 365,
      extraQuery: { status: { $in: ['Completed', 'Cancelled'] } }
    }
  ];

  try {
    for (const cfg of streamConfigs) {
      const cutoffDate = new Date(startTime.getTime() - cfg.retentionDays * 24 * 60 * 60 * 1000);
      const query = {
        [cfg.dateField]: { $lt: cutoffDate },
        ...cfg.extraQuery
      };

      // Find all records eligible for archiving
      const expiredRecords = await cfg.model.find(query).lean();
      const count = expiredRecords.length;

      if (count > 0) {
        const dateStr = startTime.toISOString().slice(0, 10);
        const timeStr = startTime.toTimeString().slice(0, 5).replace(':', 'h');
        const cleanStream = cfg.stream.toUpperCase();
        const filename = `SFTR_ColdArchive_${cleanStream}_${dateStr}_${timeStr}.json.gz`;
        const filepath = path.join(ARCHIVE_DIR, filename);

        // Compress JSON to GZIP (.json.gz) cold storage archive
        const jsonString = JSON.stringify({
          stream: cfg.stream,
          archived_at: startTime.toISOString(),
          retention_days_policy: cfg.retentionDays,
          cutoff_date: cutoffDate.toISOString(),
          total_records: count,
          records: expiredRecords
        }, null, 2);

        const gzippedBuffer = zlib.gzipSync(Buffer.from(jsonString, 'utf8'), { level: zlib.constants.Z_BEST_COMPRESSION });
        fs.writeFileSync(filepath, gzippedBuffer);
        const sizeBytes = gzippedBuffer.length;

        // Cold Purge: Remove from active MongoDB collection
        await cfg.model.deleteMany(query);

        totalRecordsProcessed += count;
        totalBytesSaved += sizeBytes;

        results.push({
          stream: cfg.stream,
          retention_days: cfg.retentionDays,
          cutoff_date: cutoffDate,
          records_archived: count,
          records_purged: count,
          archive_filename: filename,
          archive_filepath: filepath,
          archive_size_bytes: sizeBytes
        });
      } else {
        results.push({
          stream: cfg.stream,
          retention_days: cfg.retentionDays,
          cutoff_date: cutoffDate,
          records_archived: 0,
          records_purged: 0,
          archive_filename: null,
          archive_filepath: null,
          archive_size_bytes: 0
        });
      }
    }

    if (totalRecordsProcessed === 0) {
      await DataRetentionLog.findByIdAndDelete(logEntry._id);
      return {
        _id: logEntry._id,
        status: 'No_Data_Expired',
        start_time: startTime,
        end_time: new Date(),
        total_records_processed: 0,
        total_bytes_saved: 0,
        results: []
      };
    }

    logEntry.status = 'Completed';
    logEntry.end_time = new Date();
    logEntry.results = results;
    logEntry.total_records_processed = totalRecordsProcessed;
    logEntry.total_bytes_saved = totalBytesSaved;
    await logEntry.save();

    return logEntry;
  } catch (err) {
    console.error('[executeRetentionCleanUp] Error during archiving/purging:', err);
    logEntry.status = 'Failed';
    logEntry.end_time = new Date();
    logEntry.error_message = err.message || 'Cold archiving execution error';
    await logEntry.save();
    throw err;
  }
};

/**
 * Get audit history of all archiving runs
 */
exports.getArchiveLogs = async (limit = 30) => {
  return await DataRetentionLog.find()
    .populate('executed_by', 'full_name email role')
    .sort({ start_time: -1 })
    .limit(limit)
    .lean();
};

/**
 * Validate security & resolve absolute file path for downloading an archive
 */
exports.resolveArchiveFilePath = (filename) => {
  if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return null;
  }
  const filepath = path.join(ARCHIVE_DIR, filename);
  if (fs.existsSync(filepath)) {
    return filepath;
  }
  return null;
};

/**
 * Generate human-readable corporate Excel workbook (.xlsx) from a .json.gz cold storage archive
 */
exports.generateArchiveExcel = async (filename) => {
  const filepath = exports.resolveArchiveFilePath(filename);
  if (!filepath) return null;

  const gzippedBuffer = fs.readFileSync(filepath);
  const jsonString = zlib.gunzipSync(gzippedBuffer).toString('utf8');
  const data = JSON.parse(jsonString);

  const stream = data.stream || 'archive';
  const records = Array.isArray(data.records) ? data.records : [];

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SFTR Cold Storage Repository';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(stream.toUpperCase());

  // Styling tokens (Arial font for Unicode Vietnamese)
  const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  const WHITE_BOLD  = { name: 'Arial', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
  const REGULAR_FONT = { name: 'Arial', size: 10, color: { argb: 'FF1E293B' } };
  const BORDER_THIN = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  };

  // Title Row
  sheet.addRow([`KHO LƯU TRỮ LẠNH — ${stream.toUpperCase()} (${records.length} BẢN GHI)`]);
  sheet.getRow(1).font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FF06B6D4' } };
  sheet.addRow([`Ngày nén lưu trữ: ${data.archived_at ? new Date(data.archived_at).toLocaleString('vi-VN') : '-'}`]);
  sheet.addRow([`Định mức lưu giữ: ${data.retention_days_policy || '-'} ngày`]);
  sheet.addRow([]);

  // Table Headers & Rows mapping
  let headers = [];
  let rows = [];

  if (stream === 'sensory') {
    headers = ['STT', 'Thời Gian Đo', 'Mã Thiết Bị IoT', 'Mực Nước (mm)', 'Tốc Độ Dâng (mm/min)', 'Cảnh Báo', 'Điểm Ngập ID'];
    rows = records.map((r, idx) => [
      idx + 1,
      r.timestamp ? new Date(r.timestamp).toLocaleString('vi-VN') : '-',
      r.device_id || '-',
      r.water_level_mm ?? 0,
      r.rising_speed_mm_per_min ?? 0,
      r.alert_level || 'Normal',
      r.inundation_point_id || '-'
    ]);
  } else if (stream === 'incidents') {
    headers = ['STT', 'Mã Báo Cáo', 'Tiêu Đề', 'Danh Mục', 'Trạng Thái Kiểm Duyệt', 'Trạng Thái Vòng Đời', 'Độ Tin Cậy AI (%)', 'Thời Gian Gửi', 'Người Gửi'];
    rows = records.map((r, idx) => [
      idx + 1,
      r.report_code || r._id?.toString()?.slice(-8).toUpperCase() || '-',
      r.title || '-',
      r.category || '-',
      r.moderation_status || '-',
      r.lifecycle_status || '-',
      r.ai_confidence ? Math.round(r.ai_confidence * 100) + '%' : '-',
      (r.created_at || r.timestamp) ? new Date(r.created_at || r.timestamp).toLocaleString('vi-VN') : '-',
      r.reporter_id?.full_name || r.reporter_name || 'Người dân'
    ]);
  } else if (stream === 'system_logs') {
    headers = ['STT', 'Thời Gian', 'Hành Động', 'Tài Khoản / Role', 'Đối Tượng', 'ID Tham Chiếu', 'Chi Tiết / Lý Do'];
    rows = records.map((r, idx) => [
      idx + 1,
      r.timestamp ? new Date(r.timestamp).toLocaleString('vi-VN') : '-',
      r.action || '-',
      r.actor_role ? `${r.actor_role} (${r.actor_id || '-'})` : '-',
      r.target_type || '-',
      r.target_id || '-',
      r.details || r.reason || '-'
    ]);
  } else if (stream === 'rescues') {
    headers = ['STT', 'Mã SOS', 'Tình Trạng Khẩn Cấp', 'Trạng Thái', 'Thời Gian Yêu Cầu', 'ID Người Dân', 'ID Nhân Viên / Volunteer', 'Giá Tiền (VND)'];
    rows = records.map((r, idx) => [
      idx + 1,
      r.session_code || r._id?.toString()?.slice(-8).toUpperCase() || '-',
      r.emergency_type || '-',
      r.status || '-',
      r.created_at ? new Date(r.created_at).toLocaleString('vi-VN') : '-',
      r.citizen_id || '-',
      r.assigned_volunteer_id || r.assigned_staff_id || '-',
      r.final_price_vnd ?? 0
    ]);
  } else {
    // Fallback flatten
    if (records.length > 0 && typeof records[0] === 'object') {
      headers = ['STT', ...Object.keys(records[0])];
      rows = records.map((r, idx) => [
        idx + 1,
        ...Object.keys(records[0]).map(k => typeof r[k] === 'object' ? JSON.stringify(r[k]) : (r[k] ?? '-'))
      ]);
    } else {
      headers = ['STT', 'Dữ Liệu'];
      rows = records.map((r, idx) => [idx + 1, JSON.stringify(r)]);
    }
  }

  const headerRow = sheet.addRow(headers);
  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = WHITE_BOLD;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = BORDER_THIN;
  });

  rows.forEach(rowVals => {
    const r = sheet.addRow(rowVals);
    r.height = 20;
    r.eachCell((cell, colNumber) => {
      cell.font = REGULAR_FONT;
      cell.border = BORDER_THIN;
      cell.alignment = { vertical: 'middle', horizontal: colNumber === 1 || typeof cell.value === 'number' ? 'center' : 'left' };
    });
  });

  // Auto column widths
  sheet.columns.forEach(column => {
    let maxLen = 12;
    column.eachCell({ includeEmpty: true }, cell => {
      const valStr = cell.value ? cell.value.toString() : '';
      if (valStr.length > maxLen) maxLen = valStr.length;
    });
    column.width = Math.min(Math.max(maxLen + 3, 12), 42);
  });

  return await workbook.xlsx.writeBuffer();
};
