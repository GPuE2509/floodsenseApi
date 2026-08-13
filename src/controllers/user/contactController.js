const User = require('../../models/User');

/**
 * Search users by full_name or email for adding to emergency contacts.
 * Excludes Admin and Manager roles, excludes current user, and checks existing contacts.
 */
exports.searchContacts = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || !q.trim()) {
      return res.status(200).json({ success: true, data: [] });
    }

    const searchQuery = q.trim();
    const escapedFullQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const tokens = searchQuery.split(/[\s,]+/).filter(Boolean);

    const andConditions = tokens.map(token => {
      const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return {
        $or: [
          { full_name: { $regex: escapedToken, $options: 'i' } },
          { email: { $regex: escapedToken, $options: 'i' } },
          { phone: { $regex: escapedToken, $options: 'i' } }
        ]
      };
    });

    // Get current user to check existing contacts
    const currentUser = await User.findById(req.user._id).select('emergency_contacts');
    const existingContactIds = (currentUser?.emergency_contacts || []).map(c => c.user_id?.toString()).filter(Boolean);
    existingContactIds.push(req.user._id.toString()); // Exclude self

    const users = await User.find({
      _id: { $nin: existingContactIds },
      role: { $nin: ['Admin', 'Manager'] },
      status: { $ne: 'Suspended' },
      $or: [
        { full_name: { $regex: escapedFullQuery, $options: 'i' } },
        { email: { $regex: escapedFullQuery, $options: 'i' } },
        { phone: { $regex: escapedFullQuery, $options: 'i' } },
        ...(tokens.length > 1 ? [{ $and: andConditions }] : [])
      ]
    }).select('_id full_name email phone avatar_url role').limit(20).lean();

    return res.status(200).json({
      success: true,
      data: users
    });
  } catch (error) {
    console.error('Error in searchContacts controller:', error);
    return res.status(500).json({ success: false, message: 'Server error while searching contacts.' });
  }
};

/**
 * Get current user's emergency contacts list.
 */
exports.getContacts = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('emergency_contacts');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    return res.status(200).json({
      success: true,
      data: user.emergency_contacts || []
    });
  } catch (error) {
    console.error('Error in getContacts controller:', error);
    return res.status(500).json({ success: false, message: 'Server error while fetching contacts.' });
  }
};

/**
 * Add a user to emergency contacts list with a custom label.
 */
exports.addContact = async (req, res) => {
  try {
    const { contact_user_id, label } = req.body;
    if (!contact_user_id) {
      return res.status(400).json({ success: false, message: 'Contact user ID is required.' });
    }

    if (contact_user_id === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot add yourself as an emergency contact.' });
    }

    const targetUser = await User.findById(contact_user_id).select('_id full_name email phone role status');
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'Target user not found.' });
    }

    if (['Admin', 'Manager'].includes(targetUser.role)) {
      return res.status(400).json({ success: false, message: 'Cannot add Admin or Manager accounts as emergency contacts.' });
    }

    const user = await User.findById(req.user._id);
    if (!user.emergency_contacts) {
      user.emergency_contacts = [];
    }

    // Check if already exists
    const exists = user.emergency_contacts.some(c => c.user_id.toString() === contact_user_id);
    if (exists) {
      return res.status(400).json({ success: false, message: 'User is already in your emergency contacts list.' });
    }

    user.emergency_contacts.push({
      user_id: targetUser._id,
      full_name: targetUser.full_name,
      email: targetUser.email,
      phone: targetUser.phone || '',
      label: label && label.trim() ? label.trim() : 'Family',
      added_at: new Date()
    });

    await user.save();

    return res.status(201).json({
      success: true,
      message: 'Emergency contact added successfully.',
      data: user.emergency_contacts
    });
  } catch (error) {
    console.error('Error in addContact controller:', error);
    return res.status(500).json({ success: false, message: 'Server error while adding contact.' });
  }
};

/**
 * Remove a user from emergency contacts list.
 */
exports.deleteContact = async (req, res) => {
  try {
    const { contactId } = req.params;
    const user = await User.findById(req.user._id);
    if (!user || !user.emergency_contacts) {
      return res.status(404).json({ success: false, message: 'User or contacts list not found.' });
    }

    user.emergency_contacts = user.emergency_contacts.filter(
      c => c._id.toString() !== contactId && c.user_id.toString() !== contactId
    );

    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Emergency contact removed successfully.',
      data: user.emergency_contacts
    });
  } catch (error) {
    console.error('Error in deleteContact controller:', error);
    return res.status(500).json({ success: false, message: 'Server error while removing contact.' });
  }
};
