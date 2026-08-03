const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../../models/User');
const Volunteer = require('../../models/Volunteer');
const Workshop = require('../../models/Workshop');
const WorkshopStaff = require('../../models/WorkshopStaff');
const { BCRYPT_SALT_ROUNDS } = require('../../utils/authUtils');
const { deleteImage, uploadImage } = require('../../utils/uploadCloudinary');
const { sendPasswordChangeNotificationEmail } = require('../../utils/sendEmail');

exports.getUserProfile = async (userOrId) => {
  let user;
  let userId;
  if (userOrId && typeof userOrId === 'object' && userOrId._id) {
    user = userOrId;
    userId = user._id;
  } else {
    userId = userOrId;
    user = await User.findById(userId).select('-password_hash');
    if (!user) {
      const error = new Error('User does not exist.');
      error.status = 404;
      throw error;
    }
  }

  // Run independent queries in parallel
  const [pendingVolunteer, staffLinks] = await Promise.all([
    Volunteer.findOne({ user_id: userId, status: 'Pending_Approval' }),
    WorkshopStaff.find({ user_id: userId })
  ]);

  let pendingWorkshop = null;
  let activeWorkshopName = null;
  const ownerLinks = staffLinks.filter(link => link.is_owner === true);
  const activeStaffLink = staffLinks.find(link => link.status === 'Available');

  if (activeStaffLink) {
    activeWorkshopName = activeStaffLink.workshop_name;
  }

  if (ownerLinks.length > 0) {
    const workshopIds = ownerLinks.map(link => link.workshop_id);
    const ws = await Workshop.findOne({
      _id: { $in: workshopIds },
      status: 'Pending_Approval'
    });
    if (ws) {
      pendingWorkshop = {
        requestedRole: 'workshop',
        workshopName: ws.name
      };
    }
  }

  // Calculate ranks
  const weeklyPoints = user.weekly_points || 0;
  const monthlyPoints = user.monthly_points || 0;
  const allTimePoints = user.contribution_points || 0;
  const roles = ['User', 'Volunteer', 'Workshop'];

  const [weeklyRankCount, monthlyRankCount, allTimeRankCount] = await Promise.all([
    weeklyPoints > 0 ? User.countDocuments({ weekly_points: { $gt: weeklyPoints }, role: { $in: roles } }) : Promise.resolve(null),
    monthlyPoints > 0 ? User.countDocuments({ monthly_points: { $gt: monthlyPoints }, role: { $in: roles } }) : Promise.resolve(null),
    allTimePoints > 0 ? User.countDocuments({ contribution_points: { $gt: allTimePoints }, role: { $in: roles } }) : Promise.resolve(null),
  ]);

  const weeklyRank = weeklyRankCount !== null ? weeklyRankCount + 1 : null;
  const monthlyRank = monthlyRankCount !== null ? monthlyRankCount + 1 : null;
  const allTimeRank = allTimeRankCount !== null ? allTimeRankCount + 1 : null;

  return {
    user,
    pendingVolunteer: pendingVolunteer ? {
      requestedRole: 'volunteer',
      vehicleType: pendingVolunteer.vehicle_type
    } : null,
    pendingWorkshop,
    activeWorkshopName,
    weeklyRank,
    monthlyRank,
    allTimeRank
  };
};

exports.updateUserProfile = async (userId, updateData) => {
  const fieldsToUpdate = {};
  
  if (updateData.full_name !== undefined) {
    if (typeof updateData.full_name !== 'string' || updateData.full_name.trim().length < 2) {
      const error = new Error('Full name must be at least 2 characters.');
      error.status = 400;
      throw error;
    }
    fieldsToUpdate.full_name = updateData.full_name.trim();
  }

  if (updateData.phone !== undefined) {
    fieldsToUpdate.phone = updateData.phone ? updateData.phone.trim() : '';
  }

  if (updateData.dob !== undefined) {
    fieldsToUpdate.dob = updateData.dob ? updateData.dob.trim() : '';
  }

  if (updateData.district !== undefined) {
    fieldsToUpdate.district = updateData.district ? updateData.district.trim() : '';
  }

  if (updateData.avatar_url !== undefined) {
    fieldsToUpdate.avatar_url = updateData.avatar_url ? updateData.avatar_url.trim() : '';
  }

  if (Object.keys(fieldsToUpdate).length === 0) {
    const user = await User.findById(userId).select('-password_hash');
    if (!user) {
      const error = new Error('User does not exist.');
      error.status = 404;
      throw error;
    }
    return {
      id: user._id,
      email: user.email,
      full_name: user.full_name,
      phone: user.phone,
      dob: user.dob,
      district: user.district,
      avatar_url: user.avatar_url,
      role: user.role,
    };
  }

  // Optimize: Performs a single findByIdAndUpdate operation to save a DB roundtrip
  const user = await User.findByIdAndUpdate(
    userId,
    { $set: fieldsToUpdate },
    { new: true, runValidators: true }
  ).select('-password_hash');

  if (!user) {
    const error = new Error('User does not exist.');
    error.status = 404;
    throw error;
  }

  return {
    id: user._id,
    email: user.email,
    full_name: user.full_name,
    phone: user.phone,
    dob: user.dob,
    district: user.district,
    avatar_url: user.avatar_url,
    role: user.role,
  };
};

exports.updateUserAvatar = async (userOrId, fileBuffer) => {
  let user;
  if (userOrId && typeof userOrId === 'object' && userOrId._id) {
    user = userOrId;
  } else {
    user = await User.findById(userOrId).select('avatar_url');
    if (!user) {
      const error = new Error('User does not exist.');
      error.status = 404;
      throw error;
    }
  }

  const oldAvatarUrl = user.avatar_url;

  const folder = `smart-flood-traffic/users/${user._id}`;
  const publicId = `avatar-${user._id}-${Date.now()}`;
  const result = await uploadImage(fileBuffer, folder, publicId);

  user.avatar_url = result.secure_url;
  await user.save();

  // Optimize: Clean up the old avatar from Cloudinary asynchronously in the background
  if (oldAvatarUrl && oldAvatarUrl.includes('cloudinary.com')) {
    const regex = /\/upload\/(?:v\d+\/)?([^\.]+)/;
    const match = oldAvatarUrl.match(regex);
    if (match && match[1]) {
      deleteImage(match[1]).catch((deleteErr) => {
        console.error('Failed to delete old avatar asynchronously:', deleteErr);
      });
    }
  }

  return result.secure_url;
};

exports.changeUserPassword = async (userId, currentPassword, newPassword, currentToken) => {
  // Optimize: Select only password_hash, email, full_name to reduce document size
  const user = await User.findById(userId).select('password_hash email full_name');
  if (!user) {
    const error = new Error('User does not exist.');
    error.status = 404;
    throw error;
  }

  const isPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!isPasswordValid) {
    const error = new Error('Current password is incorrect.');
    error.status = 400;
    throw error;
  }

  user.password_hash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
  await user.save();

  sendPasswordChangeNotificationEmail(user.email, user.full_name).catch((mailErr) => {
    console.error('Failed to send password change notification email:', mailErr);
  });
};

exports.deleteUserAvatar = async (userOrId) => {
  let user;
  if (userOrId && typeof userOrId === 'object' && userOrId._id) {
    user = userOrId;
  } else {
    user = await User.findById(userOrId).select('avatar_url');
    if (!user) {
      const error = new Error('User does not exist.');
      error.status = 404;
      throw error;
    }
  }

  const oldAvatarUrl = user.avatar_url;

  // Set avatar_url to empty string to return to default avatar
  user.avatar_url = '';
  await user.save();

  // Clean up the old avatar from Cloudinary asynchronously in the background
  if (oldAvatarUrl && oldAvatarUrl.includes('cloudinary.com')) {
    const regex = /\/upload\/(?:v\d+\/)?([^\.]+)/;
    const match = oldAvatarUrl.match(regex);
    if (match && match[1]) {
      deleteImage(match[1]).catch((deleteErr) => {
        console.error('Failed to delete old avatar asynchronously:', deleteErr);
      });
    }
  }

  return '';
};

exports.claimDailyPoints = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    const error = new Error('User does not exist.');
    error.status = 404;
    throw error;
  }

  const now = new Date();
  const vnNow = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + (3600000 * 7));
  
  let vnLastClaim = null;
  if (user.last_daily_claim) {
    const lastClaim = new Date(user.last_daily_claim);
    vnLastClaim = new Date(lastClaim.getTime() + (lastClaim.getTimezoneOffset() * 60000) + (3600000 * 7));
  }

  const isSameDay = (d1, d2) => d1 && d2 && d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();

  if (vnLastClaim && isSameDay(vnLastClaim, vnNow)) {
    const error = new Error('Already claimed today.');
    error.status = 400;
    throw error;
  }

  let streakBroken = false;
  let previousStreak = user.daily_streak || 0;

  if (vnLastClaim) {
    const yesterday = new Date(vnNow.getTime() - 86400000);
    if (isSameDay(vnLastClaim, yesterday)) {
      user.daily_streak = previousStreak + 1;
    } else {
      streakBroken = previousStreak > 0;
      user.daily_streak = 1;
    }
  } else {
    user.daily_streak = 1;
  }

  if (user.daily_streak > 7) {
    user.daily_streak = 1;
  }

  let pointsToAward = 2;
  if (user.daily_streak === 3) pointsToAward = 4;
  else if (user.daily_streak === 7) pointsToAward = 6;

  user.contribution_points = (user.contribution_points || 0) + pointsToAward;
  user.last_daily_claim = now;
  await user.save();

  return {
    pointsAwarded: pointsToAward,
    newStreak: user.daily_streak,
    totalPoints: user.contribution_points,
    is_broken: streakBroken,
    previous_streak: previousStreak
  };
};
