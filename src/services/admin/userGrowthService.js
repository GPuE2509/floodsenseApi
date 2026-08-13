const User = require('../../models/User');
const Volunteer = require('../../models/Volunteer');
const Workshop = require('../../models/Workshop');

/**
 * Service to aggregate and compute user growth statistics
 * Only accessible by Admin
 * @param {Object} params
 * @param {string} params.range - The timeframe to fetch ('7days', '30days', '12months')
 * @returns {Promise<Object>} Formatted user growth metrics
 */
exports.getUserGrowthMetrics = async ({ range = '30days' }) => {
  const now = new Date();
  let startDate;
  let groupByFormat;
  let daysCount;

  if (range === '7days') {
    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    startDate.setHours(0, 0, 0, 0);
    groupByFormat = '%Y-%m-%d';
    daysCount = 7;
  } else if (range === '12months') {
    startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    startDate.setHours(0, 0, 0, 0);
    groupByFormat = '%Y-%m';
    daysCount = 12;
  } else {
    // default to 30days
    startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    startDate.setHours(0, 0, 0, 0);
    groupByFormat = '%Y-%m-%d';
    daysCount = 30;
  }

  // 1. Get base count (users registered before this range)
  const baseCount = await User.countDocuments({ created_at: { $lt: startDate } });

  // 2. Aggregate new user counts in range
  const aggregations = await User.aggregate([
    {
      $match: {
        created_at: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: { $dateToString: { format: groupByFormat, date: "$created_at" } },
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  const statsMap = {};
  aggregations.forEach(item => {
    statsMap[item._id] = item.count;
  });

  // Generate continuous timeline and compute running totals
  const growthByDate = [];
  let runningTotal = baseCount;

  if (range === '12months') {
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const key = `${year}-${month}`;
      const count = statsMap[key] || 0;
      runningTotal += count;
      growthByDate.push({
        period: key,
        newUsers: count,
        totalUsers: runningTotal
      });
    }
  } else {
    for (let i = daysCount - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const key = `${year}-${month}-${day}`;
      const count = statsMap[key] || 0;
      runningTotal += count;
      growthByDate.push({
        period: key,
        newUsers: count,
        totalUsers: runningTotal
      });
    }
  }

  // 3. Get overall statistics
  const totalUsers = await User.countDocuments();

  // Role distribution
  const roleDistributionRaw = await User.aggregate([
    {
      $group: {
        _id: "$role",
        count: { $sum: 1 }
      }
    }
  ]);
  const roleDistribution = roleDistributionRaw.map(r => ({
    role: r._id || 'Guest',
    count: r.count
  }));

  // Status distribution
  const statusDistributionRaw = await User.aggregate([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 }
      }
    }
  ]);
  const statusDistribution = statusDistributionRaw.map(s => ({
    status: s._id || 'Pending',
    count: s.count
  }));

  // District/Area distribution
  const districtDistributionRaw = await User.aggregate([
    {
      $group: {
        _id: "$district",
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } }
  ]);
  const districtDistribution = districtDistributionRaw.map(d => ({
    district: d._id || 'Not updated',
    count: d.count
  }));

  // 4. Growth summaries (Today, Week, Month compared to previous periods)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  const weekAgoStart = new Date(todayStart);
  weekAgoStart.setDate(weekAgoStart.getDate() - 7);

  const twoWeeksAgoStart = new Date(weekAgoStart);
  twoWeeksAgoStart.setDate(twoWeeksAgoStart.getDate() - 7);

  const monthAgoStart = new Date(todayStart);
  monthAgoStart.setDate(monthAgoStart.getDate() - 30);

  const twoMonthsAgoStart = new Date(monthAgoStart);
  twoMonthsAgoStart.setDate(twoMonthsAgoStart.getDate() - 30);

  const todayCount = await User.countDocuments({ created_at: { $gte: todayStart } });
  const yesterdayCount = await User.countDocuments({ created_at: { $gte: yesterdayStart, $lt: todayStart } });

  const thisWeekCount = await User.countDocuments({ created_at: { $gte: weekAgoStart } });
  const lastWeekCount = await User.countDocuments({ created_at: { $gte: twoWeeksAgoStart, $lt: weekAgoStart } });

  const thisMonthCount = await User.countDocuments({ created_at: { $gte: monthAgoStart } });
  const lastMonthCount = await User.countDocuments({ created_at: { $gte: twoMonthsAgoStart, $lt: monthAgoStart } });

  // Get pending role upgrades count
  const pendingVolunteersCount = await Volunteer.countDocuments({ status: 'Pending_Approval' });
  const pendingWorkshopsCount = await Workshop.countDocuments({ status: 'Pending_Approval' });
  const pendingRoleUpgrades = pendingVolunteersCount + pendingWorkshopsCount;

  return {
    totalUsers,
    growthByDate,
    roleDistribution,
    statusDistribution,
    districtDistribution,
    pendingRoleUpgrades,
    summary: {
      today: todayCount,
      yesterday: yesterdayCount,
      thisWeek: thisWeekCount,
      lastWeek: lastWeekCount,
      thisMonth: thisMonthCount,
      lastMonth: lastMonthCount
    }
  };
};
