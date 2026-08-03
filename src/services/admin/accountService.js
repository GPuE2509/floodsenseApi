const User = require('../../models/User');
const IncidentReport = require('../../models/IncidentReport');
const Volunteer = require('../../models/Volunteer');
const Workshop = require('../../models/Workshop');
const WorkshopStaff = require('../../models/WorkshopStaff');

/**
 * Get all users and enrich them with report counts and formatted values
 * @returns {Promise<Array>} List of formatted user objects
 */
exports.getAllUsersWithReports = async ({ search, role, status } = {}) => {
  const query = {};

  if (search && search.trim()) {
    const searchRegex = new RegExp(search.trim(), 'i');
    query.$or = [
      { full_name: searchRegex },
      { email: searchRegex },
      { phone: searchRegex }
    ];
  }

  if (role && role !== 'all') {
    if (role === 'workshop_owner' || role === 'workshop_staff') {
      query.role = 'Workshop';
      const isOwner = role === 'workshop_owner';
      const activeWorkshops = await Workshop.find({ status: 'Active' });
      const activeWorkshopIds = activeWorkshops.map(w => w._id);
      const staffs = await WorkshopStaff.find({
        is_owner: isOwner,
        status: { $in: ['Available', 'Busy'] },
        workshop_id: { $in: activeWorkshopIds }
      });
      const userIds = staffs.map(s => s.user_id).filter(id => id);
      query._id = { $in: userIds };
    } else if (role === 'workshop') {
      query.role = 'Workshop';
      const activeWorkshops = await Workshop.find({ status: 'Active' });
      const activeWorkshopIds = activeWorkshops.map(w => w._id);
      const staffs = await WorkshopStaff.find({
        status: { $in: ['Available', 'Busy'] },
        workshop_id: { $in: activeWorkshopIds }
      });
      const userIds = staffs.map(s => s.user_id).filter(id => id);
      query._id = { $in: userIds };
    } else {
      const capitalizedRole = role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
      query.role = capitalizedRole;
    }
  }

  if (status && status !== 'all') {
    if (status === 'active') query.status = 'Active';
    else if (status === 'locked') query.status = 'Suspended';
    else if (status === 'pending') query.status = 'Pending';
  }

  const dbUsers = await User.find(query).select('-password_hash').sort({ created_at: -1 });

  const reportCounts = await IncidentReport.aggregate([
    { $group: { _id: '$reporter_id', count: { $sum: 1 } } }
  ]);

  const reportCountMap = {};
  reportCounts.forEach(item => {
    if (item._id) {
      reportCountMap[item._id.toString()] = item.count;
    }
  });

  const userIds = dbUsers.map(u => u._id);
  const activeWorkshops = await Workshop.find({ status: 'Active' });
  const activeWorkshopIds = activeWorkshops.map(w => w._id);
  const staffLinks = await WorkshopStaff.find({
    user_id: { $in: userIds },
    workshop_id: { $in: activeWorkshopIds }
  });
  const staffMap = {};
  staffLinks.forEach(link => {
    if (link.user_id) {
      staffMap[link.user_id.toString()] = link;
    }
  });

  return dbUsers.map(user => {
    let roleLower = user.role ? user.role.toLowerCase() : 'user';
    if (roleLower === 'workshop') {
      const staffInfo = staffMap[user._id.toString()];
      if (staffInfo && ['Available', 'Busy'].includes(staffInfo.status)) {
        roleLower = staffInfo.is_owner ? 'workshop_owner' : 'workshop_staff';
      } else {
        roleLower = 'user';
      }
    }

    let statusMapped = 'active';
    if (user.status === 'Suspended') {
      statusMapped = 'locked';
    } else if (user.status === 'Pending') {
      statusMapped = 'pending';
    }

    const joinedDate = user.created_at
      ? new Date(user.created_at).toLocaleDateString('vi-VN')
      : 'Unknown';

    return {
      id: user._id.toString(),
      name: user.full_name || 'Unnamed',
      email: user.email,
      phone: user.phone || 'None',
      role: roleLower,
      status: statusMapped,
      reports: reportCountMap[user._id.toString()] || 0,
      joined: joinedDate,
      lastSeen: user.updated_at
        ? new Date(user.updated_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' today'
        : 'N/A',
      district: user.district || 'Not updated',
      points: user.contribution_points || 0,
      avatar_url: user.avatar_url || '',
    };
  });
};

/**
 * Update a user's role
 * @param {string} adminUserId ID of the admin requesting the change
 * @param {string} targetUserId ID of the user whose role is being changed
 * @param {string} role The new role (case-insensitive)
 * @returns {Promise<string>} The updated role in lowercase
 */
exports.updateUserRole = async (adminUserId, targetUserId, role) => {
  if (!role) {
    throw { status: 400, message: 'New role is required.' };
  }

  const validRoles = ['Guest', 'User', 'Volunteer', 'Workshop', 'Manager', 'Admin'];
  const matchedRole = validRoles.find(r => r.toLowerCase() === role.toLowerCase());

  if (!matchedRole) {
    throw { status: 400, message: 'Invalid new role.' };
  }

  if (targetUserId === adminUserId) {
    throw { status: 400, message: 'You cannot change your own role.' };
  }

  const user = await User.findById(targetUserId);
  if (!user) {
    throw { status: 404, message: 'User not found.' };
  }

  // Prevent changing role of Admin, Volunteer, Workshop, Guest
  const disallowedCurrentRoles = ['Admin', 'Volunteer', 'Workshop', 'Guest'];
  if (disallowedCurrentRoles.includes(user.role)) {
    throw { status: 400, message: `Cannot change role of an account with role ${user.role}.` };
  }

  // Prevent promoting/demoting to anything other than User or Manager
  const allowedNewRoles = ['User', 'Manager'];
  const normalizedNewRole = matchedRole.charAt(0).toUpperCase() + matchedRole.slice(1).toLowerCase();
  if (!allowedNewRoles.includes(normalizedNewRole)) {
    throw { status: 400, message: 'Role can only be changed to User or Manager.' };
  }

  user.role = matchedRole;
  await user.save();

  return matchedRole.toLowerCase();
};

/**
 * Update a user's status (active/locked)
 * @param {string} adminUserId ID of the admin requesting the change
 * @param {string} targetUserId ID of the user whose status is being changed
 * @param {string} status The new status ('active' or 'locked')
 * @returns {Promise<string>} The updated status ('active' or 'locked')
 */
exports.updateUserStatus = async (adminUserId, targetUserId, status) => {
  if (!['active', 'locked'].includes(status)) {
    throw { status: 400, message: 'Invalid status.' };
  }

  if (targetUserId === adminUserId) {
    throw { status: 400, message: 'You cannot lock your own account.' };
  }

  const user = await User.findById(targetUserId);
  if (!user) {
    throw { status: 404, message: 'User not found.' };
  }

  if (user.role === 'Admin') {
    throw { status: 400, message: 'Cannot lock an Administrator account.' };
  }

  const dbStatus = status === 'locked' ? 'Suspended' : 'Active';
  user.status = dbStatus;
  await user.save();

  try {
    const SystemLog = require('../../models/SystemLog');
    await SystemLog.create({
      operator_id: adminUserId,
      action: status === 'locked' ? 'SUSPEND_USER' : 'REACTIVATE_USER',
      target_id: targetUserId,
      reason: `Account status updated to ${status} for ${user.full_name} (${user.email})`
    });
  } catch (logErr) {
    console.error('Failed to create system log for user status update:', logErr);
  }

  return status;
};

/**
 * Get all pending role upgrade requests (Volunteer and Workshop)
 * @returns {Promise<Array>} List of pending requests
 */
exports.getRoleRequests = async () => {
  // 1. Fetch pending Volunteers
  const pendingVolunteers = await Volunteer.find({ status: 'Pending_Approval' }).populate('user_id');
  
  const volunteerRequests = pendingVolunteers.map(vol => ({
    id: vol._id.toString(),
    userId: vol.user_id ? vol.user_id._id.toString() : null,
    userName: vol.user_id ? vol.user_id.full_name : 'Unnamed',
    userEmail: vol.user_id ? vol.user_id.email : 'No email',
    userPhone: vol.user_id ? vol.user_id.phone : 'No phone number',
    requestedRole: 'volunteer',
    date: vol.registered_at ? new Date(vol.registered_at).toLocaleDateString('vi-VN') : 'N/A',
    status: 'pending',
    details: {
      vehicleType: vol.vehicle_type,
      vehiclePlate: vol.vehicle_plate,
      vehicleImage: vol.vehicle_image,
      currentLat: vol.current_lat,
      currentLng: vol.current_lng
    }
  }));

  // 2. Fetch pending Workshops
  const pendingWorkshops = await Workshop.find({ status: 'Pending_Approval' });
  const workshopRequests = [];
  
  for (const ws of pendingWorkshops) {
    const staffLink = await WorkshopStaff.findOne({ workshop_id: ws._id, is_owner: true }).populate('user_id');
    workshopRequests.push({
      id: ws._id.toString(),
      userId: staffLink && staffLink.user_id ? staffLink.user_id._id.toString() : null,
      userName: staffLink && staffLink.user_id ? staffLink.user_id.full_name : 'Unnamed',
      userEmail: staffLink && staffLink.user_id ? staffLink.user_id.email : 'No email',
      userPhone: (staffLink && staffLink.user_id && staffLink.user_id.phone) ? staffLink.user_id.phone : (ws.phone || 'No phone number'),
      requestedRole: 'workshop',
      workshopName: ws.name,
      date: ws.created_at ? new Date(ws.created_at).toLocaleDateString('vi-VN') : 'N/A',
      status: 'pending',
      details: {
        name: ws.name,
        phone: ws.phone,
        address: ws.address,
        lat: ws.lat,
        lng: ws.lng,
        services: ws.services || []
      }
    });
  }

  // Combine and return
  return [...volunteerRequests, ...workshopRequests];
};

/**
 * Handle approving or rejecting a role request
 * @param {string} adminUserId ID of the admin acting on the request
 * @param {string} requestId ID of the request (Volunteer or Workshop document ID)
 * @param {string} type Role request type ('volunteer' or 'workshop')
 * @param {string} action Action to perform ('approve' or 'reject')
 */
exports.handleRoleRequest = async (adminUserId, requestId, type, action) => {
  if (!['volunteer', 'workshop'].includes(type)) {
    throw { status: 400, message: 'Invalid approval request type.' };
  }
  
  if (!['approve', 'reject'].includes(action)) {
    throw { status: 400, message: 'Invalid operation.' };
  }

  if (type === 'volunteer') {
    const vol = await Volunteer.findById(requestId);
    if (!vol) {
      throw { status: 404, message: 'Volunteer registration profile not found.' };
    }

    if (action === 'approve') {
      vol.status = 'Approved';
      await vol.save();

      // Update User role
      await User.findByIdAndUpdate(vol.user_id, { role: 'Volunteer' });
    } else {
      vol.status = 'Rejected';
      await vol.save();
    }
  } else if (type === 'workshop') {
    const ws = await Workshop.findById(requestId);
    if (!ws) {
      throw { status: 404, message: 'Workshop registration profile not found.' };
    }

    const staffLink = await WorkshopStaff.findOne({ workshop_id: ws._id, is_owner: true });

    if (action === 'approve') {
      ws.status = 'Active';
      await ws.save();

      if (staffLink) {
        staffLink.status = 'Available';
        await staffLink.save();

        // Update User role
        await User.findByIdAndUpdate(staffLink.user_id, { role: 'Workshop' });
      }
    } else {
      ws.status = 'Suspended';
      await ws.save();

      if (staffLink) {
        staffLink.status = 'Suspended';
        await staffLink.save();
      }
    }
  }

  return { success: true };
};

/**
 * Get system logs with filters and pagination
 * @param {Object} params
 * @param {string} params.search - Operator name search term
 * @param {string} params.action - Action filter
 * @param {number} params.page - Page index
 * @param {number} params.limit - Max items per page
 * @returns {Promise<Object>} Formatted logs with pagination info
 */
exports.getSystemLogs = async ({ search, action, page = 1, limit = 10 }) => {
  const SystemLog = require('../../models/SystemLog');
  const query = {};

  if (action && action !== 'all') {
    query.action = action;
  }

  let userQuery = {};
  if (search && search.trim()) {
    const searchRegex = new RegExp(search.trim(), 'i');
    userQuery = { full_name: searchRegex };
  }

  const logs = await SystemLog.find(query)
    .populate({
      path: 'operator_id',
      match: userQuery,
      select: 'full_name email role'
    })
    .sort({ timestamp: -1 });

  let filteredLogs = logs;
  if (search && search.trim()) {
    filteredLogs = logs.filter(log => log.operator_id !== null);
  }

  const total = filteredLogs.length;
  const startIndex = (page - 1) * limit;
  const paginatedLogs = filteredLogs.slice(startIndex, startIndex + limit);

  return {
    logs: paginatedLogs.map(log => ({
      id: log._id.toString(),
      operator: log.operator_id ? {
        id: log.operator_id._id.toString(),
        name: log.operator_id.full_name,
        email: log.operator_id.email,
        role: log.operator_id.role
      } : { name: 'Unknown Operator' },
      action: log.action,
      targetId: log.target_id ? log.target_id.toString() : null,
      reason: log.reason || 'No description',
      timestamp: log.timestamp
    })),
    total,
    pages: Math.ceil(total / limit)
  };
};

/**
 * Delete a system log entry by ID
 * @param {string} logId
 * @returns {Promise<boolean>}
 */
exports.deleteSystemLog = async (logId) => {
  const SystemLog = require('../../models/SystemLog');
  const log = await SystemLog.findById(logId);
  if (!log) {
    throw { status: 404, message: 'Operation log not found.' };
  }
  await log.deleteOne();
  return true;
};
