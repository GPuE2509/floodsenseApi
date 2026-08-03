const IncidentReport = require('../../models/IncidentReport');
const User = require('../../models/User');
const Notification = require('../../models/Notification');
const SystemConfig = require('../../models/SystemConfig');
const SystemLog = require('../../models/SystemLog');
const RescueSession = require('../../models/RescueSession');
const cloudinary = require('../../config/cloudinary');
const mongoose = require('mongoose');
const wsHelper = require('../../utils/wsHelper');
const { checkAndTriggerWarningZoneAlerts } = require('../../utils/warningZoneHelper');

/**
 * Haversine formula: tính khoảng cách giữa 2 tọa độ GPS (đơn vị: mét)
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // radius of Earth in meters
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Xác định trọng số (weight) của mỗi vote dựa trên contribution_points
 * Level 1 (<50): 1 điểm
 * Level 2 (50-199): 2 điểm  
 * Level 3 (>=200): 3 điểm
 */
function getVoteWeight(contributionPoints) {
  if (contributionPoints >= 200) return 3;
  if (contributionPoints >= 50) return 2;
  return 1;
}

/**
 * Create a new incident report
 */
exports.createReport = async (data) => {
  const { 
    reporter_id,
    title, 
    description, 
    images, 
    lng, 
    lat, 
    report_type, 
    ai_confidence_score, 
    is_approved_by_ai,
    duration_hours,
    severity
  } = data;

  let parsedImages = [];
  try {
    if (typeof images === 'string') {
      parsedImages = JSON.parse(images);
    } else if (Array.isArray(images)) {
      parsedImages = images;
    }
  } catch (e) {}

  const uploadPromises = parsedImages.map(async (img) => {
    let base64Data = '';
    if (typeof img === 'string') { 
      base64Data = img;
    } else if (img && img.url) { 
      base64Data = img.url;
    }

    if (base64Data) {
      try {
        const result = await cloudinary.uploader.upload(base64Data, {
          folder: 'sftr_incident_reports'
        });
        return { url: result.secure_url, name: `cloudinary_${result.public_id}` };
      } catch (error) {
        console.error('Cloudinary upload error:', error);
        return null;
      }
    }
    return null;
  });

  const results = await Promise.all(uploadPromises);
  const savedImageUrls = results.filter(r => r !== null);

  let expiredAt = null;
  if (duration_hours && !isNaN(parseFloat(duration_hours))) {
    expiredAt = new Date(Date.now() + parseFloat(duration_hours) * 60 * 60 * 1000);
  }

  const reportData = {
    title,
    description,
    images: JSON.stringify(savedImageUrls),
    lng,
    lat,
    report_type,
    ai_confidence_score,
    is_approved_by_ai,
    moderation_status: is_approved_by_ai ? 'Approved' : 'Pending',
    lifecycle_status: 'Active',
    expiredAt,
    expiration_notified: false,
    severity: severity || 'Medium'
  };
  
  if (reporter_id && mongoose.Types.ObjectId.isValid(reporter_id)) {
    if (String(reporter_id).length === 24) {
      reportData.reporter_id = reporter_id;
    }
  }

  const newReport = new IncidentReport(reportData);
  const savedReport = await newReport.save();

  checkAndTriggerWarningZoneAlerts(savedReport.lat, savedReport.lng, {
    title: `Cảnh báo ngập lụt từ cộng đồng: ${savedReport.title}`,
    body: savedReport.description || `Có báo cáo ngập lụt tại khu vực lân cận.`,
    type: 'Flood_In_Warning_Zone',
    reference_id: savedReport._id,
    reference_type: 'incident_reports',
    metadata: {
      sender_name: 'Cộng đồng',
      web_url: `/reports`,
    }
  }).catch(err => console.error('Error triggering warning zone alerts from user report:', err));

  try {
    const districtStr = savedReport.district || 'nearby';
    await Notification.create({
      recipient_role: 'Admin',
      title: 'New Incident Report Pending Review',
      body: `A new report "${savedReport.title}" has been submitted in ${districtStr} and is pending review.`,
      type: 'System_Alert',
      reference_id: savedReport._id,
      reference_type: 'incident_reports',
      metadata: {
        sender_name: 'System',
        web_url: `/reports`
      }
    });

    await Notification.create({
      recipient_role: 'Manager',
      title: 'New Incident Report Pending Review',
      body: `A new report "${savedReport.title}" has been submitted in ${districtStr} and is pending review.`,
      type: 'System_Alert',
      reference_id: savedReport._id,
      reference_type: 'incident_reports',
      metadata: {
        sender_name: 'System',
        web_url: `/reports`
      }
    });
  } catch (err) {
    console.error('Failed to create incident report notifications:', err);
  }

  if (savedReport.reporter_id) {
    try {
      const config = await SystemConfig.findOne({ key: 'default' });
      let rewardPoints = 3;
      if (config && config.points_report_submit !== undefined) {
        rewardPoints = config.points_report_submit;
      }
      await User.findByIdAndUpdate(savedReport.reporter_id, {
        $inc: { contribution_points: rewardPoints, weekly_points: rewardPoints, monthly_points: rewardPoints }
      });
    } catch (err) {
      console.error('Failed to award reporter submit points:', err);
    }
  }

  wsHelper.broadcast({ type: 'MAP_UPDATE' });
  wsHelper.broadcast({ type: 'incident_report_updated' });
  wsHelper.broadcast({ type: 'rescue-update' });

  return savedReport;
};

/**
 * Get all incident reports (supports pagination)
 */
exports.getReports = async ({ page, limit = 5 }) => {
  if (page) {
    const skip = (page - 1) * limit;
    const total = await IncidentReport.countDocuments();
    const reports = await IncidentReport.find()
      .populate('reporter_id', 'full_name email phone')
      .populate('voters.user_id', 'full_name email phone avatar_url contribution_points')
      .sort({ created_at: -1 }).skip(skip).limit(limit);
    return {
      reports,
      pagination: { total, page, pages: Math.ceil(total / limit) }
    };
  } else {
    const reports = await IncidentReport.find()
      .populate('reporter_id', 'full_name email phone')
      .populate('voters.user_id', 'full_name email phone avatar_url contribution_points')
      .sort({ created_at: -1 });
    return { reports };
  }
};

/**
 * Get count of new reports since a timestamp
 */
exports.getNewCount = async (since) => {
  const query = since && !isNaN(parseInt(since)) ? { created_at: { $gt: new Date(parseInt(since)) } } : {};
  return await IncidentReport.countDocuments(query);
};

/**
 * Get a single incident report by ID
 */
exports.getReportById = async (id) => {
  return await IncidentReport.findById(id)
    .populate('reporter_id', 'full_name email phone avatar_url contribution_points')
    .populate('voters.user_id', 'full_name email phone avatar_url contribution_points');
};

/**
 * Vote on an incident report
 */
exports.voteReport = async (id, voteData) => {
  const { vote_type, user_id, lat, lng, photo_urls } = voteData;

  const report = await IncidentReport.findById(id);
  if (!report) {
    const error = new Error('Report not found');
    error.statusCode = 404;
    throw error;
  }
  if (report.lifecycle_status === 'Archived') {
    const error = new Error('Cannot vote on an archived report');
    error.statusCode = 400;
    throw error;
  }

  // Block creator from voting on own report unless attaching proof photos
  const isReporter = report.reporter_id && (
    report.reporter_id.toString() === user_id.toString() ||
    (typeof report.reporter_id === 'object' && report.reporter_id._id?.toString() === user_id.toString())
  );
  const hasPhotos = photo_urls && Array.isArray(photo_urls) && photo_urls.length > 0;
  if (isReporter && !hasPhotos) {
    const error = new Error('You cannot vote on your own report.');
    error.statusCode = 400;
    throw error;
  }

  let distance_m = null;
  const MAX_DISTANCE_M = 150;
  if (lat != null && lng != null && report.lat != null && report.lng != null) {
    distance_m = Math.round(haversineDistance(parseFloat(lat), parseFloat(lng), report.lat, report.lng));
  }

  const userObjectId = mongoose.Types.ObjectId.isValid(user_id) ? new mongoose.Types.ObjectId(user_id) : null;
  const existingVoteIndex = report.voters.findIndex(v => v.user_id?.toString() === user_id.toString());

  if (existingVoteIndex !== -1) {
    const prev = report.voters[existingVoteIndex].vote_type;
    if (prev === 'confirm') report.vote_still_exist = Math.max(0, report.vote_still_exist - 1);
    else if (prev === 'deny') report.vote_no_more = Math.max(0, report.vote_no_more - 1);
    else if (prev === 'false') report.vote_wrong_report = Math.max(0, report.vote_wrong_report - 1);
    report.voters.splice(existingVoteIndex, 1);
  }

  if (vote_type) {
    if (vote_type === 'confirm') report.vote_still_exist += 1;
    else if (vote_type === 'deny') report.vote_no_more += 1;
    else if (vote_type === 'false') report.vote_wrong_report += 1;

    let finalPhotoUrl = null;
    if (photo_urls && Array.isArray(photo_urls) && photo_urls.length > 0) {
      const uploadedUrls = [];
      for (const p of photo_urls) {
        if (p && p.startsWith('data:image')) {
          try {
            const result = await cloudinary.uploader.upload(p, { folder: 'incident_reports' });
            uploadedUrls.push(result.secure_url);
          } catch (err) {
            console.error('Error uploading vote photo:', err);
          }
        } else if (p && p.startsWith('http')) {
          uploadedUrls.push(p);
        }
      }
      if (uploadedUrls.length > 0) {
        finalPhotoUrl = JSON.stringify(uploadedUrls);
      }
    }

    report.voters.push({
      user_id: userObjectId || user_id,
      vote_type,
      lat: lat ? parseFloat(lat) : undefined,
      lng: lng ? parseFloat(lng) : undefined,
      distance_m,
      photo_url: finalPhotoUrl || undefined,
      created_at: new Date()
    });

    if (vote_type === 'confirm') {
      const extension = 60 * 60 * 1000;
      report.expiredAt = new Date(Math.max(Date.now(), (report.expiredAt || Date.now())) + extension);
      report.lifecycle_status = 'Active';
      report.expiration_notified = false;
    } else if (vote_type === 'deny' || vote_type === 'false') {
      const validDenyVotes = report.voters.filter(v =>
        (v.vote_type === 'deny' || v.vote_type === 'false') &&
        ((v.distance_m != null && v.distance_m <= MAX_DISTANCE_M) || v.photo_url)
      );

      let totalDenyWeight = 0;
      if (validDenyVotes.length > 0) {
        const voterIds = validDenyVotes.map(v => v.user_id);
        const votersInfo = await User.find({ _id: { $in: voterIds } }).select('contribution_points');
        
        for (const v of validDenyVotes) {
          const uInfo = votersInfo.find(u => u._id.toString() === v.user_id.toString());
          const pts = uInfo?.contribution_points || 0;
          totalDenyWeight += getVoteWeight(pts);
        }
      }

      if (totalDenyWeight >= 3) {
        report.lifecycle_status = 'Archived';
      }
    }
  }

  if (distance_m != null && distance_m <= MAX_DISTANCE_M && userObjectId) {
    try {
      const config = await SystemConfig.findOne({ key: 'default' });
      let rewardPoints = 2;
      if (config && config.points_report_feedback !== undefined) {
        rewardPoints = config.points_report_feedback;
      }
      await User.findByIdAndUpdate(userObjectId, { $inc: { contribution_points: rewardPoints, weekly_points: rewardPoints, monthly_points: rewardPoints } });
    } catch (err) {
      console.error('Failed to update contribution points:', err);
    }
  }

  const savedReport = await report.save();

  if (savedReport.lifecycle_status === 'Archived') {
    try {
      await Notification.create({
        recipient_role: 'Manager',
        title: `Report Auto-Archived: ${savedReport.title}`,
        body: `Report "${savedReport.title}" has been automatically archived based on community votes.`,
        type: 'System_Alert',
        reference_id: savedReport._id,
        reference_type: 'incident_reports',
        metadata: { sender_name: 'Community Vote', web_url: '/reports' }
      });
    } catch (err) {
      console.error('Failed to notify manager of auto-archive:', err);
    }
  }

  wsHelper.broadcast({ type: 'MAP_UPDATE' });
  wsHelper.broadcast({ type: 'incident_report_updated' });
  wsHelper.broadcast({ type: 'rescue-update' });

  return { savedReport, distance_m };
};

/**
 * Update incident report moderation status or lifecycle status
 */
exports.updateReportStatus = async (id, { status, severity }, operatorUser) => {
  const report = await IncidentReport.findById(id);
  if (!report) {
    const error = new Error('Report not found');
    error.statusCode = 404;
    throw error;
  }

  if (status === 'archive') {
    report.lifecycle_status = 'Archived';
    
    if (operatorUser) {
      try {
        await SystemLog.create({
          operator_id: operatorUser._id,
          action: 'ARCHIVE_REPORT',
          target_id: report._id,
          reason: `Archived incident report titled "${report.title || 'untitled'}"`
        });
      } catch (logErr) {
        console.error('Failed to create system log for report archive:', logErr);
      }
    }
  } else if (['approved', 'rejected', 'pending'].includes(status)) {
    const mappedStatus = status.charAt(0).toUpperCase() + status.slice(1);
    report.moderation_status = mappedStatus;
    if (severity) {
      report.severity = severity;
    }

    if (['approved', 'rejected'].includes(status) && report.reporter_id) {
      try {
        const config = await SystemConfig.findOne({ key: 'default' });
        let pointDelta = 0;
        
        if (status === 'approved') {
          pointDelta = 12;
          if (config) {
            if (report.severity === 'Light') pointDelta = config.points_report_verified_light;
            else if (report.severity === 'Serious') pointDelta = config.points_report_verified_serious;
            else pointDelta = config.points_report_verified_medium;
          }
        } else if (status === 'rejected') {
          pointDelta = -10;
          if (config && config.points_false_report_penalty !== undefined) {
            pointDelta = config.points_false_report_penalty;
          }
        }

        if (pointDelta !== 0) {
          await User.findByIdAndUpdate(report.reporter_id, {
            $inc: { contribution_points: pointDelta, weekly_points: pointDelta, monthly_points: pointDelta }
          });
        }
      } catch (err) {
        console.error('Failed to update reporter points:', err);
      }
    }
    
    if (operatorUser && ['approved', 'rejected'].includes(status)) {
      try {
        await SystemLog.create({
          operator_id: operatorUser._id,
          action: status === 'approved' ? 'APPROVE_REPORT' : 'REJECT_REPORT',
          target_id: report._id,
          reason: `${status === 'approved' ? 'Approved' : 'Rejected'} incident report titled "${report.title || 'untitled'}"`
        });
      } catch (logErr) {
        console.error('Failed to create system log for report moderation:', logErr);
      }
    }
  } else {
    const error = new Error('Invalid status. Use: approved, rejected, pending, archive');
    error.statusCode = 400;
    throw error;
  }

  await report.save();

  wsHelper.broadcast({ type: 'MAP_UPDATE' });
  wsHelper.broadcast({ type: 'incident_report_updated' });
  wsHelper.broadcast({ type: 'rescue-update' });

  return report;
};

/**
 * Get incident processing logs (combining IncidentReport & RescueSession)
 */
exports.getIncidentProcessingLogs = async () => {
  const reports = await IncidentReport.find({})
    .populate('reporter_id', 'full_name email phone avatar_url')
    .populate('moderated_by', 'full_name email role')
    .sort({ created_at: -1 })
    .limit(200)
    .lean();

  const rescueSessions = await RescueSession.find({})
    .populate('requester_id', 'full_name email phone avatar_url')
    .populate({
      path: 'assigned_volunteer_id',
      populate: { path: 'user_id', select: 'full_name phone email' }
    })
    .populate({
      path: 'assigned_staff_id',
      populate: { path: 'user_id', select: 'full_name phone email' }
    })
    .populate('workshop_id', 'name phone')
    .sort({ created_at: -1 })
    .limit(200)
    .lean();

  const reportLogs = reports.map(r => {
    const createdTime = new Date(r.created_at || Date.now());
    const isResolved = r.lifecycle_status === 'Archived' || r.moderation_status === 'Approved';
    const resolutionTimeMins = isResolved 
      ? Math.max(1, Math.round(((r.expiredAt ? new Date(r.expiredAt) : new Date(createdTime.getTime() + 120 * 60000)) - createdTime) / 60000))
      : null;

    const categoryMap = {
      flood: 'Flood',
      accident: 'Accident',
      tree: 'Tree Down',
      traffic: 'Traffic Jam',
      infra: 'Infrastructure'
    };
    const category = categoryMap[r.report_type] || 'Accident / Hazard';

    const timeline = [
      {
        stage: 'Reported',
        title: `Report Submitted by ${r.reporter_id?.full_name || 'Community Member'}`,
        time: createdTime.toLocaleString('en-US', { hour12: false }),
        timestamp: createdTime.toISOString(),
        status: 'completed',
        detail: `AI Confidence Score: ${(r.ai_confidence_score || 0.85).toFixed(2)} (${r.is_approved_by_ai ? 'Auto-Verified' : 'Pending Verification'})`
      }
    ];

    if (r.moderation_status !== 'Pending') {
      const modTime = new Date(createdTime.getTime() + 15 * 60000);
      timeline.push({
        stage: 'Moderated',
        title: `Report ${r.moderation_status}`,
        time: modTime.toLocaleString('en-US', { hour12: false }),
        timestamp: modTime.toISOString(),
        status: 'completed',
        detail: r.moderated_by 
          ? `Reviewed and processed by ${r.moderated_by.full_name} (${r.moderated_by.role || 'Admin'})`
          : `Reviewed by Area Manager / AI System`
      });
    }

    if (r.lifecycle_status === 'Archived') {
      const archTime = r.expiredAt ? new Date(r.expiredAt) : new Date(createdTime.getTime() + 120 * 60000);
      timeline.push({
        stage: 'Resolved / Archived',
        title: 'Incident Lifecycle Completed',
        time: archTime.toLocaleString('en-US', { hour12: false }),
        timestamp: archTime.toISOString(),
        status: 'completed',
        detail: `Incident cleared and archived from active tactical maps. Votes: ${r.vote_no_more || 0} confirmed resolved.`
      });
    } else {
      timeline.push({
        stage: 'Active Monitoring',
        title: 'Currently Active on Map',
        time: 'Live',
        timestamp: new Date().toISOString(),
        status: 'active',
        detail: `Lifecycle status: ${r.lifecycle_status}. Community votes: ${r.vote_still_exist || 0} still present.`
      });
    }

    const assignedName = r.moderated_by?.full_name 
      ? `${r.moderated_by.full_name} (Moderator)` 
      : (r.is_approved_by_ai ? 'AI Automated Shield' : 'Pending Manager Review');

    return {
      id: `REP-${r._id.toString().slice(-6).toUpperCase()}`,
      rawId: r._id,
      sourceType: 'IncidentReport',
      category,
      title: r.title || `${category} Report`,
      description: r.description || 'No detailed description provided.',
      location: { lat: r.lat, lng: r.lng },
      reporter: {
        name: r.reporter_id?.full_name || 'Anonymous User',
        phone: r.reporter_id?.phone || 'N/A',
        avatar: r.reporter_id?.avatar_url || null
      },
      assignedResponder: assignedName,
      status: r.lifecycle_status === 'Archived' ? 'Resolved' : (r.moderation_status === 'Approved' ? 'Active' : r.moderation_status),
      created_at: createdTime.toISOString(),
      resolutionTimeMinutes: resolutionTimeMins,
      timeline,
      aiScore: r.ai_confidence_score || 0.85,
      votes: { confirm: r.vote_still_exist || 0, resolve: r.vote_no_more || 0 }
    };
  });

  const rescueLogs = rescueSessions.map(s => {
    const createdTime = new Date(s.created_at || Date.now());
    const isCompleted = s.status === 'Completed' || s.status === 'Cancelled';
    const endTime = s.completed_at ? new Date(s.completed_at) : (s.updated_at ? new Date(s.updated_at) : null);
    let resolutionTimeMins = null;
    if (isCompleted) {
      if (endTime) {
        resolutionTimeMins = Math.max(1, Math.round((endTime - createdTime) / 60000));
      } else if (s.status === 'Cancelled') {
        resolutionTimeMins = (!s.assigned_volunteer_id && !s.assigned_staff_id) ? 'Cancelled (N/A)' : 'Cancelled (< 1 min)';
      } else if (s.status === 'Completed') {
        resolutionTimeMins = s.arrived_at ? Math.max(1, Math.round((new Date(s.arrived_at) - createdTime + 15 * 60000) / 60000)) : 'Completed (N/A)';
      }
    }

    const categoryMap = {
      Trapped_By_Flood: 'Flood Rescue',
      Medical: 'Medical Emergency',
      Vehicle_Broken: 'Vehicle Breakdown',
      Other: 'Emergency SOS'
    };
    const category = categoryMap[s.emergency_type] || (s.custom_emergency_type || 'Emergency SOS');

    let responder = 'Awaiting Responder Assignment';
    if (s.assigned_volunteer_id) {
      const name = s.assigned_volunteer_id.user_id?.full_name || s.assigned_volunteer_id.full_name || 'Volunteer Unit';
      responder = `${name} (Volunteer)`;
    } else if (s.assigned_staff_id) {
      const staffName = s.assigned_staff_id.user_id?.full_name || s.assigned_staff_id.full_name || 'Workshop Staff';
      const wsName = s.workshop_id?.name || s.assigned_staff_id.workshop_name || 'Workshop Team';
      responder = `${staffName} (${wsName})`;
    } else if (s.workshop_id) {
      responder = `${s.workshop_id.name || 'Repair Workshop'} (Workshop)`;
    }

    const timeline = [
      {
        stage: 'SOS Triggered',
        title: `Emergency Request by ${s.requester_id?.full_name || 'User'}`,
        time: createdTime.toLocaleString('en-US', { hour12: false }),
        timestamp: createdTime.toISOString(),
        status: 'completed',
        detail: `Type: ${category}. Phone: ${s.sender_phone || s.requester_id?.phone || 'N/A'}`
      }
    ];

    if (['Assigned', 'In_Progress', 'Arrived', 'Completed'].includes(s.status)) {
      const assignTime = new Date(createdTime.getTime() + 5 * 60000);
      timeline.push({
        stage: 'Responder Assigned',
        title: `Assigned to ${responder}`,
        time: assignTime.toLocaleString('en-US', { hour12: false }),
        timestamp: assignTime.toISOString(),
        status: 'completed',
        detail: `Assigned unit accepted task and initiated live GPS navigation tracking.`
      });
    }

    if (['In_Progress', 'Arrived', 'Completed'].includes(s.status)) {
      const arriveTime = new Date(createdTime.getTime() + 18 * 60000);
      timeline.push({
        stage: 'On Scene / In Progress',
        title: `Responder Arrived on Scene`,
        time: arriveTime.toLocaleString('en-US', { hour12: false }),
        timestamp: arriveTime.toISOString(),
        status: 'completed',
        detail: `Direct assistance in progress. Live telemetry linked to Victim HUD.`
      });
    }

    if (s.status === 'Completed') {
      const compTime = s.completed_at ? new Date(s.completed_at) : (s.updated_at ? new Date(s.updated_at) : (s.arrived_at ? new Date(s.arrived_at.getTime() + 15 * 60000) : new Date(createdTime.getTime() + 20 * 60000)));
      timeline.push({
        stage: 'Resolved / Completed',
        title: `Rescue Mission Successfully Completed`,
        time: compTime.toLocaleString('en-US', { hour12: false }),
        timestamp: compTime.toISOString(),
        status: 'completed',
        detail: `Safe check-in confirmed: ${s.safe_checked_in ? 'Yes' : 'Checked out'}. Total service cost logged.`
      });
    } else if (s.status === 'Cancelled') {
      const cancelTime = new Date(createdTime.getTime() + 10 * 60000);
      timeline.push({
        stage: 'Cancelled',
        title: `Rescue Request Cancelled`,
        time: cancelTime.toLocaleString('en-US', { hour12: false }),
        timestamp: cancelTime.toISOString(),
        status: 'completed',
        detail: `Session cancelled by requester or coordinator.`
      });
    } else {
      timeline.push({
        stage: 'Active Operation',
        title: `Current Status: ${s.status}`,
        time: 'Live',
        timestamp: new Date().toISOString(),
        status: 'active',
        detail: `Ongoing emergency session tracking in progress.`
      });
    }

    return {
      id: `SOS-${s._id.toString().slice(-6).toUpperCase()}`,
      rawId: s._id,
      sourceType: 'RescueSession',
      category,
      title: `${category} Request`,
      description: s.description || `Emergency SOS for ${category}. Services requested: ${s.selected_services?.map(srv => srv.service_name).join(', ') || 'Standard Rescue'}`,
      location: { lat: s.initial_lat, lng: s.initial_lng },
      reporter: {
        name: s.requester_id?.full_name || 'Stranded User',
        phone: s.sender_phone || s.requester_id?.phone || 'N/A',
        avatar: s.requester_id?.avatar_url || null
      },
      assignedResponder: responder,
      status: s.status === 'Completed' ? 'Resolved' : s.status,
      created_at: createdTime.toISOString(),
      resolutionTimeMinutes: resolutionTimeMins,
      timeline,
      aiScore: 1.0,
      votes: null
    };
  });

  const allLogs = [...reportLogs, ...rescueLogs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const totalCount = allLogs.length;
  const resolvedCount = allLogs.filter(l => ['Resolved', 'Archived', 'Completed', 'Approved'].includes(l.status)).length;
  const activeOperationsCount = allLogs.filter(l => !['Resolved', 'Archived', 'Completed', 'Approved', 'Cancelled', 'Rejected'].includes(l.status)).length;
  const cancelledCount = allLogs.filter(l => ['Cancelled', 'Rejected'].includes(l.status)).length;

  return {
    summary: {
      totalIncidents: totalCount,
      resolvedIncidents: resolvedCount,
      activeOperations: activeOperationsCount,
      cancelledIncidents: cancelledCount
    },
    data: allLogs
  };
};
