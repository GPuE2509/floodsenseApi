const Workshop = require('../../models/Workshop');
const WorkshopStaff = require('../../models/WorkshopStaff');
const User = require('../../models/User');
const Notification = require('../../models/Notification');
const ShiftAssignment = require('../../models/ShiftAssignment');

exports.inviteStaff = async (ownerId, { phone_or_email }) => {
  // Find the owner's workshop
  const ownerStaffLink = await WorkshopStaff.findOne({ user_id: ownerId, is_owner: true });
  if (!ownerStaffLink) {
    const error = new Error('You do not own a workshop.');
    error.status = 403;
    throw error;
  }

  const workshop = await Workshop.findById(ownerStaffLink.workshop_id);
  if (!workshop) {
    const error = new Error('Workshop not found.');
    error.status = 404;
    throw error;
  }

  // Find the user to invite
  const userToInvite = await User.findOne({
    $or: [{ email: phone_or_email }, { phone: phone_or_email }],
    role: 'User'
  });

  if (!userToInvite) {
    const error = new Error('User not found with the provided phone or email.');
    error.status = 404;
    throw error;
  }

  // Prevent inviting oneself
  if (userToInvite._id.toString() === ownerId.toString()) {
    const error = new Error('You cannot send invite to yourself.');
    error.status = 400;
    throw error;
  }

  // Check if user is already invited or a staff member in THIS workshop
  const existingLink = await WorkshopStaff.findOne({
    workshop_id: workshop._id,
    user_id: userToInvite._id
  });

  if (existingLink) {
    if (existingLink.status === 'Pending_Invite') {
      const error = new Error('User has already been invited.');
      error.status = 400;
      throw error;
    } else {
      const error = new Error('User is already a staff member in this workshop.');
      error.status = 400;
      throw error;
    }
  }

  // Create WorkshopStaff record as Pending_Invite
  const newStaff = new WorkshopStaff({
    workshop_id: workshop._id,
    user_id: userToInvite._id,
    workshop_name: workshop.name,
    is_owner: false,
    status: 'Pending_Invite'
  });

  await newStaff.save();

  // Notify the user
  try {
    const ownerUser = await User.findById(ownerId);
    const senderName = ownerUser ? ownerUser.full_name : 'A workshop owner';

    await Notification.create({
      recipient_id: userToInvite._id,
      title: 'Workshop Staff Invitation',
      body: `You have been invited to join "${workshop.name}" as a staff member.`,
      type: 'Workshop_Invite',
      reference_id: newStaff._id,
      metadata: {
        sender_name: senderName,
        workshop_name: workshop.name,
        web_url: '/notifications'
      }
    });
  } catch (err) {
    console.error('Failed to create invitation notification:', err);
  }

  return newStaff;
};

exports.getMyInvitations = async (userId) => {
  const invitations = await WorkshopStaff.find({
    user_id: userId,
    is_owner: false
  }).populate('workshop_id', 'name address phone cover_photo lat lng').lean(); // Get some details about the workshop

  // For each invitation, find the workshop owner to include their info
  for (let inv of invitations) {
    if (inv.workshop_id) {
      const ownerStaff = await WorkshopStaff.findOne({
        workshop_id: inv.workshop_id._id,
        is_owner: true
      }).populate('user_id', 'full_name phone email avatar_url').lean();
      
      if (ownerStaff && ownerStaff.user_id) {
        inv.workshop_id.owner = ownerStaff.user_id;
      }
    }
  }

  return invitations;
};

async function getCurrentOnDutyUserIds(workshopId) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;

  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const currentTimeVal = hours * 60 + minutes * 1;

  const ShiftTemplate = require('../../models/ShiftTemplate');

  const assignments = await ShiftAssignment.find({
    workshopId,
    date: todayStr
  }).lean();

  if (assignments.length === 0) {
    return [];
  }

  const staffUserIds = [];
  for (const assign of assignments) {
    const template = await ShiftTemplate.findById(assign.shiftTemplateId).lean();
    if (template && template.isActive) {
      const [startH, startM] = template.startTime.split(':').map(Number);
      const [endH, endM] = template.endTime.split(':').map(Number);
      
      const startVal = startH * 60 + startM;
      const endVal = endH * 60 + endM;

      let isCurrent = false;
      if (startVal <= endVal) {
        isCurrent = currentTimeVal >= startVal && currentTimeVal <= endVal;
      } else {
        isCurrent = currentTimeVal >= startVal || currentTimeVal <= endVal;
      }

      if (isCurrent && ['assigned', 'checked-in'].includes(assign.status)) {
        staffUserIds.push(assign.staffId.toString());
      }
    }
  }

  return staffUserIds;
}

exports.getWorkshopStaff = async (userId) => {
  // Find the user's active workshop link (latest first based on ObjectId)
  const userStaffLink = await WorkshopStaff.findOne({ 
    user_id: userId,
    status: { $in: ['Available', 'Busy', 'Suspended'] }
  }).sort({ _id: -1 });
  if (!userStaffLink) {
    const error = new Error('You do not belong to any workshop.');
    error.status = 403;
    throw error;
  }

  // Find all staff for this workshop
  const staff = await WorkshopStaff.find({
    workshop_id: userStaffLink.workshop_id
  }).populate('user_id', 'full_name phone avatar_url email').lean();

  const onDutyStaffUserIds = await getCurrentOnDutyUserIds(userStaffLink.workshop_id);

  const mappedStaff = staff.map(s => {
    const uidStr = s.user_id?._id?.toString() || s.user_id?.toString();
    return {
      ...s,
      isOnDuty: onDutyStaffUserIds.includes(uidStr)
    };
  });
  
  return { staff: mappedStaff, isOwner: userStaffLink.is_owner };
};

exports.acceptInvitation = async (userId, invitationId) => {
  const invitation = await WorkshopStaff.findOne({
    _id: invitationId,
    user_id: userId,
    status: 'Pending_Invite'
  });

  if (!invitation) {
    const error = new Error('Invitation not found or already processed.');
    error.status = 404;
    throw error;
  }

  // Update invitation status
  invitation.status = 'Available'; // Default status for accepted staff
  invitation.joined_at = new Date();
  await invitation.save();

  // If the user's role is currently 'User', upgrade it to 'Workshop'
  const user = await User.findById(userId);
  if (user && user.role === 'User') {
    user.role = 'Workshop';
    await user.save();
  }

  // Optional: Notify the workshop owner
  try {
    const ownerStaff = await WorkshopStaff.findOne({
      workshop_id: invitation.workshop_id,
      is_owner: true
    });
    if (ownerStaff) {
      await Notification.create({
        recipient_id: ownerStaff.user_id,
        title: 'Invitation Accepted',
        body: `${user.full_name} has accepted the invitation to join your workshop.`,
        type: 'System_Alert',
        reference_id: invitation._id,
        metadata: {
          sender_name: user.full_name,
          web_url: '/mechanics'
        }
      });
    }
  } catch (err) {
    console.error('Failed to notify owner about accepted invitation:', err);
  }

  return invitation;
};

exports.declineInvitation = async (userId, invitationId) => {
  const invitation = await WorkshopStaff.findOne({
    _id: invitationId,
    user_id: userId,
    status: 'Pending_Invite'
  });

  if (!invitation) {
    const error = new Error('Invitation not found or already processed.');
    error.status = 404;
    throw error;
  }

  // Update status to Rejected instead of deleting
  invitation.status = 'Rejected';
  await invitation.save();

  // Optional: Notify the workshop owner
  try {
    const ownerStaff = await WorkshopStaff.findOne({
      workshop_id: invitation.workshop_id,
      is_owner: true
    });
    const user = await User.findById(userId);
    if (ownerStaff && user) {
      await Notification.create({
        recipient_id: ownerStaff.user_id,
        title: 'Invitation Declined',
        body: `${user.full_name} has declined the invitation to join your workshop.`,
        type: 'System_Alert',
        reference_id: invitation.workshop_id,
        metadata: {
          sender_name: user.full_name,
          web_url: '/mechanics'
        }
      });
    }
  } catch (err) {
    console.error('Failed to notify owner about declined invitation:', err);
  }

  return { message: 'Invitation declined successfully.' };
};

exports.toggleSuspendStaff = async (ownerId, targetUserId) => {
  // Check if owner has a workshop
  const ownerStaffLink = await WorkshopStaff.findOne({ user_id: ownerId, is_owner: true });
  if (!ownerStaffLink) {
    const error = new Error('You do not own a workshop.');
    error.status = 403;
    throw error;
  }

  // Find the target staff link in this workshop
  const staffLink = await WorkshopStaff.findOne({
    workshop_id: ownerStaffLink.workshop_id,
    user_id: targetUserId,
    is_owner: false
  });

  if (!staffLink) {
    const error = new Error('Staff member not found in your workshop.');
    error.status = 404;
    throw error;
  }

  const isCurrentlySuspended = staffLink.status === 'Suspended';
  const newStatus = isCurrentlySuspended ? 'Available' : 'Suspended';

  // Update WorkshopStaff status
  staffLink.status = newStatus;
  await staffLink.save();

  // Update ShiftAssignments
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const todayStr = `${yyyy}-${mm}-${dd}`;

  if (newStatus === 'Suspended') {
    // Suspend future shifts
    await ShiftAssignment.updateMany(
      {
        workshopId: ownerStaffLink.workshop_id,
        staffId: targetUserId,
        date: { $gte: todayStr },
        status: { $ne: 'suspended' } // don't touch already suspended ones (if any) or absent
      },
      { $set: { status: 'suspended' } }
    );
  } else {
    // Unsuspend future shifts
    await ShiftAssignment.updateMany(
      {
        workshopId: ownerStaffLink.workshop_id,
        staffId: targetUserId,
        date: { $gte: todayStr },
        status: 'suspended'
      },
      { $set: { status: 'assigned' } } // assuming they return to assigned
    );
  }

  // Notify the user
  try {
    const ownerUser = await User.findById(ownerId);
    const senderName = ownerUser ? ownerUser.full_name : 'The workshop owner';
    const workshop = await Workshop.findById(ownerStaffLink.workshop_id);

    await Notification.create({
      recipient_id: targetUserId,
      title: isCurrentlySuspended ? 'Suspension Lifted' : 'Account Suspended',
      body: isCurrentlySuspended
        ? `Your suspension has been lifted at "${workshop.name}". You are now active again.`
        : `Your account has been suspended at "${workshop.name}". Future shifts are marked as suspended.`,
      type: 'System_Alert',
      reference_id: staffLink._id,
      metadata: {
        sender_name: senderName,
        web_url: '/mechanics'
      }
    });
  } catch (err) {
    console.error('Failed to notify staff about suspension toggle:', err);
  }

  return { status: newStatus };
};

exports.updateStaffLocation = async (userId, lat, lng) => {
  const staff = await WorkshopStaff.findOne({
    user_id: userId,
    status: { $in: ['Available', 'Busy'] }
  }).sort({ _id: -1 });
  if (!staff) {
    const error = new Error('Active workshop staff profile not found.');
    error.status = 404;
    throw error;
  }
  staff.current_lat = lat;
  staff.current_lng = lng;
  await staff.save();
  return staff;
};
