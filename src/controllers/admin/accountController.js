const adminService = require('../../services/admin/accountService');

/**
 * GET /admin/users
 * Returns list of all users formatted with report counts
 */
exports.getAllUsers = async (req, res) => {
  try {
    const { search, role, status } = req.query;
    const users = await adminService.getAllUsersWithReports({ search, role, status });
    return res.status(200).json({
      success: true,
      users
    });
  } catch (error) {
    console.error('Error in getAllUsers controller:', error);
    return res.status(500).json({ message: 'Server error while fetching account list.' });
  }
};

/**
 * PATCH /admin/users/:id/role
 * Updates the user's role
 */
exports.updateUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    const adminUserId = req.user._id.toString();

    const updatedRole = await adminService.updateUserRole(adminUserId, id, role);

    return res.status(200).json({
      success: true,
      message: 'Role updated successfully.',
      role: updatedRole
    });
  } catch (error) {
    console.error('Error in updateUserRole controller:', error);
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Server error while updating user role.' });
  }
};

/**
 * PATCH /admin/users/:id/status
 * Updates the user's status (locks/unlocks account)
 */
exports.updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const adminUserId = req.user._id.toString();

    const updatedStatus = await adminService.updateUserStatus(adminUserId, id, status);

    return res.status(200).json({
      success: true,
      message: `Account successfully ${updatedStatus === 'locked' ? 'locked' : 'unlocked'}.`,
      status: updatedStatus
    });
  } catch (error) {
    console.error('Error in updateUserStatus controller:', error);
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Server error while updating user status.' });
  }
};

/**
 * GET /admin/role-requests
 * Returns list of pending role requests (Volunteer/Workshop)
 */
exports.getRoleRequests = async (req, res) => {
  try {
    const requests = await adminService.getRoleRequests();
    return res.status(200).json({
      success: true,
      requests
    });
  } catch (error) {
    console.error('Error in getRoleRequests controller:', error);
    return res.status(500).json({ message: 'Server error while fetching role requests.' });
  }
};

/**
 * PUT /admin/role-requests/:id
 * Approves or rejects a role upgrade request
 */
exports.handleRoleRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { type, action } = req.body;
    const adminUserId = req.user._id.toString();

    await adminService.handleRoleRequest(adminUserId, id, type, action);

    return res.status(200).json({
      success: true,
      message: `Request successfully ${action === 'approve' ? 'approved' : 'rejected'}.`
    });
  } catch (error) {
    console.error('Error in handleRoleRequest controller:', error);
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Server error while processing role request.' });
  }
};

/**
 * GET /admin/users/growth-metrics
 * Returns aggregated user growth metrics (Only accessible by Admin)
 */
exports.getUserGrowthMetrics = async (req, res) => {
  try {
    const { range } = req.query;
    const userGrowthService = require('../../services/admin/userGrowthService');
    const metrics = await userGrowthService.getUserGrowthMetrics({ range });
    return res.status(200).json({
      success: true,
      metrics
    });
  } catch (error) {
    console.error('Error in getUserGrowthMetrics controller:', error);
    return res.status(500).json({ message: 'Server error while fetching user growth metrics.' });
  }
};

/**
 * GET /admin/system-logs
 * Returns audit system logs (Only accessible by Admin)
 */
exports.getSystemLogs = async (req, res) => {
  try {
    const { search, action, page, limit } = req.query;
    const logsData = await adminService.getSystemLogs({
      search,
      action,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 10
    });
    return res.status(200).json({
      success: true,
      ...logsData
    });
  } catch (error) {
    console.error('Error in getSystemLogs controller:', error);
    return res.status(500).json({ message: 'Server error while fetching system logs.' });
  }
};

/**
 * DELETE /admin/system-logs/:id
 * Deletes a specific audit log record (Only accessible by Admin)
 */
exports.deleteSystemLog = async (req, res) => {
  try {
    const { id } = req.params;
    await adminService.deleteSystemLog(id);
    return res.status(200).json({
      success: true,
      message: 'Operation log deleted successfully'
    });
  } catch (error) {
    console.error('Error in deleteSystemLog controller:', error);
    const status = error.status || 500;
    const msg = error.message || 'Server error while deleting log.';
    return res.status(status).json({ message: msg });
  }
};

