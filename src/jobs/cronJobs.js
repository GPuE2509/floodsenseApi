const cron = require('node-cron');
const snapshotService = require('../services/snapshotService');
const IncidentReport = require('../models/IncidentReport');
const Notification = require('../models/Notification');
const User = require('../models/User');
const DataRetentionPolicy = require('../models/DataRetentionPolicy');
const dataRetentionService = require('../services/admin/dataRetentionService');

// Schedule Weekly Snapshot (Every Sunday at 23:59).
cron.schedule('59 23 * * 0', async () => {
  console.log('Running weekly rank snapshot...');
  await snapshotService.takeSnapshotForPeriod('Weekly');
});

// Schedule Monthly Snapshot (Last day of the month at 23:59)
cron.schedule('59 23 28-31 * *', async () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (tomorrow.getDate() === 1) {
    console.log('Running monthly rank snapshot...');
    await snapshotService.takeSnapshotForPeriod('Monthly');

    if ([0, 3, 6, 9].includes(tomorrow.getMonth())) {
      console.log('Running quarterly rank snapshot...');
      await snapshotService.takeSnapshotForPeriod('Quarterly');
    }
  }
});

// ===== Monthly Data Retention & Cold Archiving Cron (01:00 AM on Day 1 of every month) =====
cron.schedule('0 1 1 * *', async () => {
  try {
    console.log('[DataRetentionCron] Checking automatic archiving schedule at 01:00 AM on Day 1...');
    const policy = await DataRetentionPolicy.findOne();
    if (policy && policy.auto_archive_enabled) {
      console.log('[DataRetentionCron] Auto-archive is ON. Starting cold archiving and DB purging...');
      const logResult = await dataRetentionService.executeRetentionCleanUp({
        triggerType: 'Scheduled_Cron',
        executedBy: null
      });
      console.log(`[DataRetentionCron] Completed! Processed ${logResult.total_records_processed} expired record(s). Saved ${(logResult.total_bytes_saved / 1024).toFixed(2)} KB.`);
    } else {
      console.log('[DataRetentionCron] Auto-archive is OFF. Skipping execution.');
    }
  } catch (err) {
    console.error('[DataRetentionCron] Error during scheduled cold archiving:', err);
  }
});

// ===== Report Lifecycle Cron (every 5 minutes) =====
cron.schedule('*/5 * * * *', async () => {
  try {
    const now = new Date();
    const in15min = new Date(now.getTime() + 15 * 60 * 1000);
    const ago30m = new Date(now.getTime() - 30 * 60 * 1000);

    // 1. Gửi thông báo "sắp hết hạn" (còn 15 phút)
    const soonExpiring = await IncidentReport.find({
      lifecycle_status: 'Active',
      expiredAt: { $gt: now, $lte: in15min },
      expiration_notified: false
    }).populate('reporter_id', 'full_name');

    for (const report of soonExpiring) {
      try {
        if (report.reporter_id) {
          await Notification.create({
            recipient_id: report.reporter_id._id,
            title: 'Your incident report is expiring soon',
            body: `Your report "${report.title}" will expire in 15 minutes. Is it still active?`,
            type: 'System_Alert',
            reference_id: report._id,
            reference_type: 'incident_reports',
            metadata: { sender_name: 'System', web_url: '/reports' }
          });
        }
        report.expiration_notified = true;
        await report.save();
      } catch (err) {
        console.error(`Failed to notify expiry for report ${report._id}:`, err);
      }
    }

    // 2. Chuyển Active -> Pending_Verification khi hết hạn
    const expiredReports = await IncidentReport.find({ lifecycle_status: 'Active', expiredAt: { $lte: now } });
    if (expiredReports.length > 0) {
      const expiredIds = expiredReports.map(r => r._id);
      const expired = await IncidentReport.updateMany(
        { _id: { $in: expiredIds } },
        { $set: { lifecycle_status: 'Pending_Verification' } }
      );
      
      console.log(`[ReportCron] ${expired.modifiedCount} report(s) moved to Pending_Verification`);
      
      // Notify managers
      const managers = await User.find({ role: { $in: ['Manager', 'Admin'] } }).select('_id');
      const { broadcast, sendToUser } = require('../utils/wsHelper');
      
      for (const report of expiredReports) {
        for (const manager of managers) {
          try {
            const notif = await Notification.create({
              recipient_id: manager._id,
              title: 'Incident Report Expired',
              body: `The report "${report.title}" has expired and is pending your review.`,
              type: 'System_Alert',
              reference_id: report._id,
              reference_type: 'incident_reports',
              metadata: { sender_name: 'System', web_url: '/reports', mobile_route: '/reports' }
            });
            sendToUser(manager._id.toString(), {
              type: 'NOTIFICATION',
              notification: notif
            });
          } catch (e) {
            console.error('Failed to notify manager:', e);
          }
        }
        
        // Notify Creator
        if (report.reporter_id) {
          try {
            const notif = await Notification.create({
              recipient_id: report.reporter_id,
              title: 'Your Report Expired',
              body: `Your report "${report.title}" has expired. Please attach proof within 30 minutes to keep it active.`,
              type: 'System_Alert',
              reference_id: report._id,
              reference_type: 'incident_reports',
              metadata: { sender_name: 'System', web_url: '/reports', mobile_route: '/reports' }
            });
            sendToUser(report.reporter_id.toString(), {
              type: 'NOTIFICATION',
              notification: notif
            });
          } catch (e) {
            console.error('Failed to notify creator:', e);
          }
        }
      }
      
      broadcast({ type: 'MAP_UPDATE' });
    }

    // 3. Tự động Archive sau 30 phút ở Pending_Verification không có ai phản hồi
    const autoArchived = await IncidentReport.updateMany(
      {
        lifecycle_status: 'Pending_Verification',
        expiredAt: { $lte: ago30m }
      },
      { $set: { lifecycle_status: 'Archived' } }
    );
    if (autoArchived.modifiedCount > 0) {
      console.log(`[ReportCron] ${autoArchived.modifiedCount} report(s) auto-archived`);
      const { broadcast } = require('../utils/wsHelper');
      broadcast({ type: 'MAP_UPDATE' });
    }

  } catch (err) {
    console.error('[ReportCron] Error in report lifecycle cron:', err);
  }
});

