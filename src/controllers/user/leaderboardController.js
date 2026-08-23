const User = require('../../models/User');
const RankHistory = require('../../models/RankHistory');
const RewardItem = require('../../models/RewardItem');
const snapshotService = require('../../services/snapshotService');


exports.getLeaderboard = async (req, res) => {
  try {
    const { tab = 'All', time = 'AllTime', year, page = 1, limit = 5 } = req.query;

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    let sortField = 'contribution_points';
    if (time === 'Weekly') sortField = 'weekly_points';
    if (time === 'Monthly') sortField = 'monthly_points';

    if (time.startsWith('Q') || time.match(/^\d{4}$/)) {
      sortField = 'contribution_points'; 
    }

    let query = {};
    if (tab === 'User') {
      query.role = 'User';
    } else if (tab === 'Volunteer') {
      query.role = 'Volunteer';
    } else if (tab === 'Workshop') {
      query.role = 'Workshop';
    } else {
      query.role = { $in: ['User', 'Volunteer', 'Workshop'] };
    }

    query[sortField] = { $gt: 0 };

    const totalItems = await User.countDocuments(query);

    const pipeline = [
      { $match: query },
      { $sort: { [sortField]: -1 } },
      { $skip: skip },
      { $limit: limitNum },
      {
        $lookup: {
          from: 'volunteers',
          localField: '_id',
          foreignField: 'user_id',
          as: 'volunteer_info'
        }
      },
      {
        $lookup: {
          from: 'workshopstaffs',
          localField: '_id',
          foreignField: 'user_id',
          as: 'staff_info'
        }
      },
      {
        $lookup: {
          from: 'workshops',
          localField: 'staff_info.workshop_id',
          foreignField: '_id',
          as: 'workshop_info'
        }
      },
      {
        $project: {
          _id: 1,
          full_name: 1,
          avatar_url: 1,
          role: 1,
          district: 1,
          contribution_points: 1,
          weekly_points: 1,
          monthly_points: 1,
          vehicle_type: { $arrayElemAt: ['$volunteer_info.vehicle_type', 0] },
          vehicle_plate: { $arrayElemAt: ['$volunteer_info.vehicle_plate', 0] },
          workshop_address: { $arrayElemAt: ['$workshop_info.address', 0] },
        }
      }
    ];

    const leaders = await User.aggregate(pipeline);


    const formattedLeaders = leaders.map((user, index) => {
      let info = '';
      if (user.role === 'User') {
        info = user.district || '';
      } else if (user.role === 'Volunteer') {
        const vehicleMap = {
          'Canoe': 'Canoe / Boat',
          'Boat': 'Canoe / Boat',
          'Pickup_Truck': 'Pickup Truck',
          'Pickup': 'Pickup Truck',
          'Wading_Motorcycle': 'Amphibious Motorbike',
          'Other': 'Other vehicles'
        };
        const vehicleLabel = vehicleMap[user.vehicle_type] || (user.vehicle_type ? user.vehicle_type.replace(/_/g, ' ') : '');
        if (vehicleLabel && user.vehicle_plate) {
          info = `${vehicleLabel} - ${user.vehicle_plate}`;
        } else if (vehicleLabel) {
          info = vehicleLabel;
        } else {
          info = user.district || 'Unknown vehicle';
        }
      } else if (user.role === 'Workshop') {
        info = user.workshop_address || user.district || 'Unknown address';
      }

      let displayPoints = user.contribution_points || 0;
      if (time === 'Weekly') displayPoints = user.weekly_points || 0;
      if (time === 'Monthly') displayPoints = user.monthly_points || 0;

      return {
        id: user._id,
        name: user.full_name,
        avatar_url: user.avatar_url,
        points: displayPoints,
        badge: user.role.toUpperCase(),
        info: info,
        originalRole: user.role
      };
    });

    res.json({
      data: formattedLeaders,
      totalItems,
      totalPages: Math.ceil(totalItems / limitNum),
      currentPage: pageNum
    });

  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ message: 'Server error fetching leaderboard' });
  }
};

exports.triggerSnapshot = async (req, res) => {
  try {
    await snapshotService.takeAllSnapshots();
    res.json({ message: 'Snapshots taken successfully!' });
  } catch (error) {
    console.error('Error taking snapshots:', error);
    res.status(500).json({ message: 'Error taking snapshots' });
  }
};

exports.getRewards = async (req, res) => {
  try {
    const rewards = await RewardItem.find().sort({ points_required: 1, createdAt: -1 });
    res.json({ success: true, data: rewards });
  } catch (error) {
    console.error('Error fetching rewards:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
