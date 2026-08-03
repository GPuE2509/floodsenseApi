const User = require('../models/User');
const RankHistory = require('../models/RankHistory');

// Helper to calculate the current ISO week number
const getWeekNumber = (d) => {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${weekNo}`;
};

const getPeriodValue = (periodType, date) => {
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-12
  const quarter = Math.floor((month - 1) / 3) + 1;

  switch (periodType) {
    case 'Weekly':
      return getWeekNumber(date);
    case 'Monthly':
      return `${year}-M${month.toString().padStart(2, '0')}`;
    case 'Quarterly':
      return `${year}-Q${quarter}`;
    case 'Yearly':
      return `${year}`;
    default:
      return null;
  }
};

const takeSnapshotForPeriod = async (periodType, date = new Date()) => {
  const periodValue = getPeriodValue(periodType, date);
  if (!periodValue) return;

  const tabs = ['All', 'User', 'Volunteer', 'Workshop'];

  let sortField = 'contribution_points';
  if (periodType === 'Weekly') sortField = 'weekly_points';
  if (periodType === 'Monthly') sortField = 'monthly_points';
  // Quarterly and Yearly will just use contribution_points for now as requested

  for (const tab of tabs) {
    let query = {};
    if (tab !== 'All') {
      query.role = tab;
    } else {
      query.role = { $in: ['User', 'Volunteer', 'Workshop'] };
    }

    const leaders = await User.find(query)
      .sort({ [sortField]: -1 })
      .limit(100) // Snapshot top 100
      .select(`_id ${sortField}`);

    const snapshotDocs = leaders.map((leader, index) => ({
      user_id: leader._id,
      period_type: periodType,
      period_value: periodValue,
      tab: tab,
      points: leader[sortField] || 0,
      rank: index + 1
    }));

    if (snapshotDocs.length > 0) {
      // Upsert to handle manual re-triggers in the same period
      for (const doc of snapshotDocs) {
        await RankHistory.findOneAndUpdate(
          {
            user_id: doc.user_id,
            period_type: doc.period_type,
            period_value: doc.period_value,
            tab: doc.tab
          },
          doc,
          { upsert: true, new: true }
        );
      }
    }
  }
  
  console.log(`Snapshot taken for ${periodType} (${periodValue})`);
};

exports.takeAllSnapshots = async () => {
  const now = new Date();
  await takeSnapshotForPeriod('Weekly', now);
  await takeSnapshotForPeriod('Monthly', now);
  await takeSnapshotForPeriod('Quarterly', now);
  console.log('All rank snapshots completed.');
};

exports.takeSnapshotForPeriod = takeSnapshotForPeriod;
exports.getPeriodValue = getPeriodValue;
