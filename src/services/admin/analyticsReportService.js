const User = require('../../models/User');
const IncidentReport = require('../../models/IncidentReport');
const RescueSession = require('../../models/RescueSession');
const WaterLevelLog = require('../../models/WaterLevelLog');
const IotDevice = require('../../models/IotDevice');

/**
 * Gom dữ liệu phân tích tổng hợp chi tiết cho báo cáo PDF v3
 * @param {Object} params
 * @param {Date}   params.dateFrom
 * @param {Date}   params.dateTo
 * @param {string[]} params.sections  - ['overview','flood_history','rescue_distribution']
 * @returns {Promise<Object>}
 */
exports.generateAnalyticsData = async ({ dateFrom, dateTo, sections = ['overview', 'flood_history', 'rescue_distribution'] }) => {
  const from = new Date(dateFrom);
  const to   = new Date(dateTo);
  to.setHours(23, 59, 59, 999);

  const results = {};
  const tasks = [];

  if (sections.includes('overview')) {
    tasks.push(
      getUserStats(from, to).then(d => { results.overview = d; })
    );
  }

  if (sections.includes('flood_history')) {
    tasks.push(
      getFloodHistoryStats(from, to).then(d => { results.floodHistory = d; })
    );
  }

  if (sections.includes('rescue_distribution')) {
    tasks.push(
      getRescueFulfillmentStats(from, to).then(d => { results.rescueFulfillment = d; })
    );
  }

  await Promise.all(tasks);

  results.metadata = {
    dateFrom: from,
    dateTo: to,
    generatedAt: new Date(),
    sections
  };

  return results;
};

/* ───────────────────────────────────────────────────────────
   SECTION 1: Tổng quan người dùng hệ thống (User Overview)
   ─────────────────────────────────────────────────────────── */
async function getUserStats(from, to) {
  const [
    totalUsers,
    newUsersInRange,
    verifiedUsersCount,
    roleDistributionRaw,
    statusDistributionRaw,
    districtDistributionRaw,
    topContributorsRaw,
    growthByDayRaw
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ created_at: { $gte: from, $lte: to } }),
    User.countDocuments({ is_verified: true }),
    User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    User.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    User.aggregate([
      { $group: { _id: '$district', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]),
    User.find({ contribution_points: { $gt: 0 } })
      .sort({ contribution_points: -1 })
      .limit(5)
      .select('full_name role district contribution_points monthly_points')
      .lean(),
    User.aggregate([
      { $match: { created_at: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$created_at' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ])
  ]);

  return {
    totalUsers,
    newUsersInRange,
    verifiedUsersCount,
    unverifiedUsersCount: Math.max(0, totalUsers - verifiedUsersCount),
    roleDistribution: roleDistributionRaw.map(r => ({ role: r._id || 'Unknown', count: r.count })),
    statusDistribution: statusDistributionRaw.map(s => ({ status: s._id || 'Unknown', count: s.count })),
    districtDistribution: districtDistributionRaw.map(d => ({
      district: d._id || 'Chưa cập nhật / Not Updated',
      count: d.count
    })),
    topContributors: topContributorsRaw.map(u => ({
      name: u.full_name || 'Anonymous User',
      role: u.role || 'User',
      district: u.district || 'Unspecified',
      points: u.contribution_points || 0,
      monthly: u.monthly_points || 0
    })),
    growthByDay: growthByDayRaw.map(g => ({ date: g._id, count: g.count }))
  };
}

/* ───────────────────────────────────────────────────────────
   SECTION 2: Lịch sử lũ lụt & Báo cáo sự cố (Flood & Incidents)
   ─────────────────────────────────────────────────────────── */
async function getFloodHistoryStats(from, to) {
  const [
    totalReports,
    reportsByTypeRaw,
    reportsByStatusRaw,
    reportsBySeverityRaw,
    reportsByLifecycleRaw,
    aiStatsRaw,
    communityVotesRaw,
    reportsByDateRaw,
    iotSummaryRaw,
    waterLevelPeakRaw
  ] = await Promise.all([
    IncidentReport.countDocuments({ created_at: { $gte: from, $lte: to } }),

    // Reports by type with approval breakdown
    IncidentReport.aggregate([
      { $match: { created_at: { $gte: from, $lte: to } } },
      { 
        $group: { 
          _id: '$report_type', 
          count: { $sum: 1 },
          approved: { $sum: { $cond: [{ $eq: ['$moderation_status', 'Approved'] }, 1, 0] } }
        } 
      },
      { $sort: { count: -1 } }
    ]),

    IncidentReport.aggregate([
      { $match: { created_at: { $gte: from, $lte: to } } },
      { $group: { _id: '$moderation_status', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),

    IncidentReport.aggregate([
      { $match: { created_at: { $gte: from, $lte: to } } },
      { $group: { _id: '$severity', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),

    IncidentReport.aggregate([
      { $match: { created_at: { $gte: from, $lte: to } } },
      { $group: { _id: '$lifecycle_status', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),

    // AI Moderation & Confidence Stats
    IncidentReport.aggregate([
      { $match: { created_at: { $gte: from, $lte: to } } },
      { 
        $group: { 
          _id: null, 
          aiApproved: { $sum: { $cond: ['$is_approved_by_ai', 1, 0] } },
          avgConfidence: { $avg: '$ai_confidence_score' }
        } 
      }
    ]),

    // Community Votes Aggregate
    IncidentReport.aggregate([
      { $match: { created_at: { $gte: from, $lte: to } } },
      { 
        $group: { 
          _id: null, 
          confirm: { $sum: { $ifNull: ['$vote_still_exist', 0] } },
          deny: { $sum: { $ifNull: ['$vote_no_more', 0] } },
          falseReport: { $sum: { $ifNull: ['$vote_wrong_report', 0] } }
        } 
      }
    ]),

    IncidentReport.aggregate([
      { $match: { created_at: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$created_at' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]),

    // IoT Stations
    IotDevice.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),

    // Peak water levels
    WaterLevelLog.aggregate([
      { $match: { timestamp: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
          maxWaterLevel: { $max: '$water_level_mm' },
          avgWaterLevel: { $avg: '$water_level_mm' }
        }
      },
      { $sort: { _id: 1 } },
      { $limit: 30 }
    ])
  ]);

  const approvedCount = (reportsByStatusRaw.find(s => s._id === 'Approved') || {}).count || 0;
  const approvalRate  = totalReports > 0 ? ((approvedCount / totalReports) * 100).toFixed(1) : '0.0';
  const aiData        = aiStatsRaw[0] || { aiApproved: 0, avgConfidence: 0 };
  const votesData     = communityVotesRaw[0] || { confirm: 0, deny: 0, falseReport: 0 };

  return {
    totalReports,
    approvalRate: parseFloat(approvalRate),
    aiStats: {
      aiApprovedCount: aiData.aiApproved || 0,
      avgConfidencePct: aiData.avgConfidence ? parseFloat((aiData.avgConfidence * 100).toFixed(1)) : 0
    },
    communityVotes: {
      confirmCount: votesData.confirm || 0,
      denyCount: votesData.deny || 0,
      falseCount: votesData.falseReport || 0,
      totalVotes: (votesData.confirm || 0) + (votesData.deny || 0) + (votesData.falseReport || 0)
    },
    reportsByType: reportsByTypeRaw.map(r => ({
      type: r._id || 'Unknown',
      count: r.count,
      approvedCount: r.approved || 0,
      typeApprovalRate: r.count > 0 ? parseFloat(((r.approved / r.count) * 100).toFixed(1)) : 0
    })),
    reportsByStatus: reportsByStatusRaw.map(s => ({ status: s._id || 'Unknown', count: s.count })),
    reportsBySeverity: reportsBySeverityRaw.map(s => ({ severity: s._id || 'Unknown', count: s.count })),
    reportsByLifecycle: reportsByLifecycleRaw.map(l => ({ status: l._id || 'Active', count: l.count })),
    reportsByDate: reportsByDateRaw.map(d => ({ date: d._id, count: d.count })),
    iotStatus: iotSummaryRaw.map(i => ({ status: i._id || 'Unknown', count: i.count })),
    waterLevelPeak: waterLevelPeakRaw.map(w => ({
      date: w._id,
      maxMm: Math.round(w.maxWaterLevel),
      avgMm: Math.round(w.avgWaterLevel)
    }))
  };
}

/* ───────────────────────────────────────────────────────────
   SECTION 3: Phân phối hoàn thành cứu hộ (Rescue Fulfillment)
   ─────────────────────────────────────────────────────────── */
async function getRescueFulfillmentStats(from, to) {
  const [
    totalSessions,
    sessionsByStatusRaw,
    sessionsByEmergencyTypeRaw,
    dispatchBreakdownRaw,
    executionStatsRaw,
    sessionsByDateRaw,
    topWorkshopsRaw
  ] = await Promise.all([
    RescueSession.countDocuments({ created_at: { $gte: from, $lte: to } }),

    RescueSession.aggregate([
      { $match: { created_at: { $gte: from, $lte: to } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),

    RescueSession.aggregate([
      { $match: { created_at: { $gte: from, $lte: to } } },
      { 
        $group: { 
          _id: '$emergency_type', 
          count: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } }
        } 
      },
      { $sort: { count: -1 } }
    ]),

    // Dispatch & Assignment breakdown
    RescueSession.aggregate([
      { $match: { created_at: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: null,
          volunteerAssigned: { $sum: { $cond: [{ $ne: ['$assigned_volunteer_id', null] }, 1, 0] } },
          staffAssigned:     { $sum: { $cond: [{ $ne: ['$assigned_staff_id', null] }, 1, 0] } },
          unassigned:        { $sum: { $cond: [{ $and: [{ $eq: ['$assigned_volunteer_id', null] }, { $eq: ['$assigned_staff_id', null] }] }, 1, 0] } }
        }
      }
    ]),

    // Execution quality & financial metrics
    RescueSession.aggregate([
      { $match: { created_at: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: null,
          safeCheckedInCount: { $sum: { $cond: ['$safe_checked_in', 1, 0] } },
          paidCount:          { $sum: { $cond: ['$is_paid', 1, 0] } },
          totalRevenue: {
            $sum: {
              $reduce: {
                input: { $ifNull: ['$selected_services', []] },
                initialValue: 0,
                in: { $add: ['$$value', { $ifNull: ['$$this.base_price', 0] }] }
              }
            }
          }
        }
      }
    ]),

    RescueSession.aggregate([
      { $match: { created_at: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$created_at' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]),

    // Top workshops with completed sessions & completion rate
    RescueSession.aggregate([
      { $match: { created_at: { $gte: from, $lte: to }, workshop_id: { $ne: null } } },
      { 
        $group: { 
          _id: '$workshop_id', 
          count: { $sum: 1 },
          completedCount: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } }
        } 
      },
      { $sort: { count: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'workshops',
          localField: '_id',
          foreignField: '_id',
          as: 'workshop'
        }
      },
      { $unwind: { path: '$workshop', preserveNullAndEmptyArrays: true } }
    ])
  ]);

  const completedCount = (sessionsByStatusRaw.find(s => s._id === 'Completed') || {}).count || 0;
  const cancelledCount = (sessionsByStatusRaw.find(s => s._id === 'Cancelled') || {}).count || 0;
  const completionRate = totalSessions > 0 ? ((completedCount / totalSessions) * 100).toFixed(1) : '0.0';
  const cancellationRate = totalSessions > 0 ? ((cancelledCount / totalSessions) * 100).toFixed(1) : '0.0';

  const dispatchData = dispatchBreakdownRaw[0] || { volunteerAssigned: 0, staffAssigned: 0, unassigned: 0 };
  const execData     = executionStatsRaw[0]    || { safeCheckedInCount: 0, paidCount: 0, totalRevenue: 0 };

  return {
    totalSessions,
    completedCount,
    cancelledCount,
    completionRate: parseFloat(completionRate),
    cancellationRate: parseFloat(cancellationRate),
    dispatchBreakdown: {
      volunteerCount: dispatchData.volunteerAssigned || 0,
      staffCount:     dispatchData.staffAssigned || 0,
      unassignedCount:dispatchData.unassigned || 0
    },
    executionStats: {
      safeCheckedInCount: execData.safeCheckedInCount || 0,
      safeCheckInRate: totalSessions > 0 ? parseFloat(((execData.safeCheckedInCount / totalSessions) * 100).toFixed(1)) : 0,
      paidCount: execData.paidCount || 0,
      paidRate: totalSessions > 0 ? parseFloat(((execData.paidCount / totalSessions) * 100).toFixed(1)) : 0,
      totalEstimatedRevenue: execData.totalRevenue || 0
    },
    sessionsByStatus: sessionsByStatusRaw.map(s => ({ status: s._id || 'Unknown', count: s.count })),
    sessionsByEmergencyType: sessionsByEmergencyTypeRaw.map(e => ({
      type: e._id || 'Unknown',
      count: e.count,
      completedCount: e.completed || 0,
      typeCompletionRate: e.count > 0 ? parseFloat(((e.completed / e.count) * 100).toFixed(1)) : 0
    })),
    sessionsByDate: sessionsByDateRaw.map(d => ({ date: d._id, count: d.count })),
    topWorkshops: topWorkshopsRaw.map(w => ({
      workshopId: w._id?.toString(),
      name: w.workshop?.name || 'Unknown Workshop',
      count: w.count,
      completedCount: w.completedCount || 0,
      completionRate: w.count > 0 ? parseFloat(((w.completedCount / w.count) * 100).toFixed(1)) : 0
    }))
  };
}
