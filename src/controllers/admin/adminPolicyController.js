const SystemConfig = require('../../models/SystemConfig');
const RewardItem = require('../../models/RewardItem');
const Notification = require('../../models/Notification');
const User = require('../../models/User');

exports.getPointsConfig = async (req, res) => {
  try {
    let config = await SystemConfig.findOne({ key: 'default' });
    if (!config) {
      config = new SystemConfig({ key: 'default' });
      await config.save();
    }
    res.json({
      success: true,
      data: {
        points_report_submit: config.points_report_submit,
        points_report_verified_light: config.points_report_verified_light,
        points_report_verified_medium: config.points_report_verified_medium,
        points_report_verified_serious: config.points_report_verified_serious,
        points_volunteer_assist: config.points_volunteer_assist,
        points_workshop_assist: config.points_workshop_assist,
        points_false_report_penalty: config.points_false_report_penalty
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updatePointsConfig = async (req, res) => {
  try {
    const {
      points_report_submit,
      points_report_verified_light,
      points_report_verified_medium,
      points_report_verified_serious,
      points_volunteer_assist,
      points_workshop_assist,
      points_false_report_penalty
    } = req.body;

    const config = await SystemConfig.findOneAndUpdate(
      { key: 'default' },
      {
        $set: {
          points_report_submit,
          points_report_verified_light,
          points_report_verified_medium,
          points_report_verified_serious,
          points_volunteer_assist,
          points_workshop_assist,
          points_false_report_penalty
        }
      },
      { new: true, upsert: true }
    );

    res.json({ success: true, data: config });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Rewards CRUD
exports.getRewards = async (req, res) => {
  try {
    const rewards = await RewardItem.find().sort({ createdAt: -1 });
    res.json({ success: true, data: rewards });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createReward = async (req, res) => {
  try {
    const newReward = new RewardItem(req.body);
    await newReward.save();
    res.status(201).json({ success: true, data: newReward });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateReward = async (req, res) => {
  try {
    const updated = await RewardItem.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Reward not found' });
    }
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteReward = async (req, res) => {
  try {
    const deleted = await RewardItem.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Reward not found' });
    }
    res.json({ success: true, message: 'Reward deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.sendReward = async (req, res) => {
  try {
    const { id } = req.params;
    const { userIds } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ success: false, message: 'No users selected' });
    }

    const reward = await RewardItem.findById(id);
    if (!reward) {
      return res.status(404).json({ success: false, message: 'Reward not found' });
    }

    const notifications = userIds.map(userId => ({
      recipient_id: userId,
      type: 'System_Alert',
      title: 'New Reward Received!',
      body: `Congratulations! You have received a reward: ${reward.name} from the administration.`,
      is_read: false
    }));

    await Notification.insertMany(notifications);

    // Update users' contribution points
    await User.updateMany(
      { _id: { $in: userIds } },
      { $inc: { contribution_points: reward.points_cost } }
    );

    res.json({ success: true, message: `Reward sent to ${userIds.length} users successfully.` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
