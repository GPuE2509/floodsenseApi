// backend/src/services/rescue/rescueService.js
const RescueSession = require('../../models/RescueSession');
const Volunteer = require('../../models/Volunteer');
const Notification = require('../../models/Notification');

/**
 * Haversine formula to calculate the distance between two GPS coordinates in meters
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Radius of the Earth in meters
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function getStaffOnDuty(workshopId) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;

  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const currentTimeVal = hours * 60 + minutes * 1;

  const ShiftAssignment = require('../../models/ShiftAssignment');
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
        const WorkshopStaff = require('../../models/WorkshopStaff');
        const staff = await WorkshopStaff.findOne({ workshop_id: workshopId, user_id: assign.staffId, status: 'Available' }).lean();
        if (staff) {
          staffUserIds.push(assign.staffId.toString());
        }
      }
    }
  }

  return staffUserIds;
}

/**
 * Create a new rescue session and notify all active volunteers within 5km radius
 * @param {Object} sessionData - { requester_id, sender_phone, emergency_type, initial_lng, initial_lat, description }
 * @param {Object} requesterUser - The User document of the requester
 */
exports.createRescueRequest = async (sessionData, requesterUser) => {
  const selectedServices = sessionData.selected_services || [];

  if (sessionData.workshop_id) {
    const Workshop = require('../../models/Workshop');
    const ownWorkshop = await Workshop.findOne({ owner_id: requesterUser._id });
    if (ownWorkshop && ownWorkshop._id.toString() === sessionData.workshop_id.toString()) {
      const err = new Error('You cannot request rescue services from your own workshop.');
      err.statusCode = 400;
      throw err;
    }
  }

  // Cancel any existing unassigned Pending sessions for this requester so duplicate clicks don't stack
  await RescueSession.updateMany(
    { requester_id: sessionData.requester_id, status: 'Pending' },
    { status: 'Cancelled', completed_at: new Date() }
  );

  // 1. Save RescueSession to Database
  const rescueSession = new RescueSession({
    requester_id: sessionData.requester_id,
    sender_phone: sessionData.sender_phone,
    emergency_type: sessionData.emergency_type,
    custom_emergency_type: sessionData.custom_emergency_type,
    photos: sessionData.photos,
    initial_lng: sessionData.initial_lng,
    initial_lat: sessionData.initial_lat,
    description: sessionData.description,
    workshop_id: sessionData.workshop_id,
    selected_services: selectedServices,
    status: 'Pending',
    safe_checked_in: false
  });

  const savedSession = await rescueSession.save();

  // Map emergency type to a user-friendly Vietnamese text for contact notifications
  const emergencyTypeLabelsEn = {
    'Trapped_By_Flood': 'Trapped in flooded area',
    'Medical': 'Emergency medical assistance needed',
    'Vehicle_Broken': 'Vehicle stalled / water damaged',
    'Other': sessionData.custom_emergency_type || 'Emergency rescue assistance'
  };
  const labelEn = emergencyTypeLabelsEn[sessionData.emergency_type] || 'Emergency rescue assistance';

  // Notify all emergency contacts of the requester
  try {
    const User = require('../../models/User');
    const fullRequester = await User.findById(requesterUser._id).select('emergency_contacts full_name avatar_url').lean();
    if (fullRequester && fullRequester.emergency_contacts && fullRequester.emergency_contacts.length > 0) {
      for (const contact of fullRequester.emergency_contacts) {
        try {
          const contactUser = await User.findById(contact.user_id).select('role').lean();
          const contactRole = contactUser?.role || 'User';

          const createdNotif = await Notification.create({
            recipient_id: contact.user_id,
            recipient_role: contactRole,
            title: `Emergency SOS Alert from ${requesterUser.full_name} (${contact.label || 'Trusted Contact'})`,
            body: `${requesterUser.full_name} triggered an SOS signal: "${labelEn}". Contact Phone: ${sessionData.sender_phone}`,
            type: 'Emergency_SOS_Contact',
            reference_id: savedSession._id,
            reference_type: 'rescue_sessions',
            metadata: {
              sender_name: requesterUser.full_name,
              avatar_url: requesterUser.avatar_url || '',
              phone: sessionData.sender_phone,
              web_url: '/sos',
              app_params: {
                lat: sessionData.initial_lat,
                lng: sessionData.initial_lng,
                rescueSessionId: savedSession._id.toString(),
                phone: sessionData.sender_phone,
                description: sessionData.description || '',
                emergency_type: sessionData.emergency_type,
                custom_emergency_type: sessionData.custom_emergency_type || '',
                photos: sessionData.photos || ''
              }
            }
          });

          try {
            const wsHelper = require('../../utils/wsHelper');
            wsHelper.sendToUser(contact.user_id, {
              type: 'notification',
              notification: createdNotif
            });
          } catch (wsErr) {
            console.error(`Failed to send WebSocket notification to ${contact.user_id}:`, wsErr);
          }
        } catch (contactNotifErr) {
          console.error(`Failed to notify emergency contact ${contact.user_id}:`, contactNotifErr);
        }
      }
    }
  } catch (contactsErr) {
    console.error('Error notifying emergency contacts:', contactsErr);
  }

  if (sessionData.workshop_id) {
    const WorkshopStaff = require('../../models/WorkshopStaff');
    const ownerStaff = await WorkshopStaff.findOne({ workshop_id: sessionData.workshop_id, is_owner: true, status: 'Available' }).lean();
    const onDutyStaffUserIds = await getStaffOnDuty(sessionData.workshop_id);

    const recipients = new Set();
    if (ownerStaff) {
      recipients.add(ownerStaff.user_id.toString());
    }
    for (const uid of onDutyStaffUserIds) {
      recipients.add(uid);
    }

    const notifiedStaff = [];
    for (const recipientId of recipients) {
      try {
        const isAvailableStaff = await WorkshopStaff.findOne({
          workshop_id: sessionData.workshop_id,
          user_id: recipientId,
          status: { $in: ['Available', 'Busy'] }
        }).lean();
        if (!isAvailableStaff) {
          continue;
        }

        await Notification.create({
          recipient_id: recipientId,
          recipient_role: 'Workshop',
          title: 'New mobile repair request',
          body: `Customer requests: "${selectedServices.map(s => s.service_name).join(', ') || 'Mobile repair'}". Phone: ${sessionData.sender_phone}`,
          type: 'Emergency_SOS_Nearby',
          reference_id: savedSession._id,
          reference_type: 'rescue_sessions',
          metadata: {
            sender_name: requesterUser.full_name,
            avatar_url: requesterUser.avatar_url || '',
            web_url: '/tasks',
            app_params: {
              lat: sessionData.initial_lat,
              lng: sessionData.initial_lng,
              rescueSessionId: savedSession._id.toString(),
              phone: sessionData.sender_phone,
              description: sessionData.description || '',
              emergency_type: sessionData.emergency_type,
              photos: sessionData.photos || '',
              selected_services: selectedServices
            }
          }
        });
        notifiedStaff.push(recipientId);
      } catch (notifErr) {
        console.error(`Failed to notify workshop staff/owner ${recipientId}:`, notifErr);
      }
    }

    const wsHelper = require('../../utils/wsHelper');
    wsHelper.broadcast({ type: 'rescue-update' });

    return {
      rescueSession: savedSession,
      notifiedCount: notifiedStaff.length,
      notifiedVolunteers: []
    };
  }

  // 2. Fetch all active/available volunteers
  const activeVolunteers = await Volunteer.find({
    status: { $in: ['Approved', 'Available', 'Busy'] }
  }).populate('user_id');

  const notifiedVolunteers = [];
  const MAX_RADIUS_METERS = 5000; // 5 km radius

  // Map emergency type to a user-friendly English text for notifications
  const emergencyTypeLabels = {
    'Trapped_By_Flood': 'Trapped in flooded area',
    'Medical': 'Urgent medical support needed',
    'Vehicle_Broken': 'Vehicle broken/engine stalled due to flood',
    'Other': sessionData.custom_emergency_type || 'Other emergency rescue request'
  };
  const emergencyTypeLabel = emergencyTypeLabels[sessionData.emergency_type] || 'Emergency rescue request';

  // 3. Filter nearby volunteers and notify them
  for (const volunteer of activeVolunteers) {
    if (volunteer.user_id && volunteer.user_id._id.toString() === requesterUser._id.toString()) {
      continue;
    }
    if (volunteer.current_lat != null && volunteer.current_lng != null) {
      const distance = haversineDistance(
        parseFloat(sessionData.initial_lat),
        parseFloat(sessionData.initial_lng),
        parseFloat(volunteer.current_lat),
        parseFloat(volunteer.current_lng)
      );

      if (distance <= MAX_RADIUS_METERS) {
        try {
          // Create a Notification. The post-save hook on Notification model
          // automatically sends a WebSocket event to the volunteer.
          const notification = await Notification.create({
            recipient_id: volunteer.user_id._id,
            recipient_role: 'Volunteer',
            title: 'Urgent rescue request nearby',
            body: `New request: "${emergencyTypeLabel}". ${Math.round(distance)}m away. Tel: ${sessionData.sender_phone}`,
            type: 'Emergency_SOS_Nearby',
            reference_id: savedSession._id,
            reference_type: 'rescue_sessions',
            metadata: {
              sender_name: requesterUser.full_name,
              avatar_url: requesterUser.avatar_url || '',
              web_url: '/missions', // Maps to Request SOS page on Volunteer panel
              app_params: {
                lat: sessionData.initial_lat,
                lng: sessionData.initial_lng,
                rescueSessionId: savedSession._id.toString(),
                distance_m: Math.round(distance),
                phone: sessionData.sender_phone,
                description: sessionData.description || '',
                emergency_type: sessionData.emergency_type,
                custom_emergency_type: sessionData.custom_emergency_type || '',
                photos: sessionData.photos || ''
              }
            }
          });

          notifiedVolunteers.push({
            volunteer_id: volunteer._id,
            user_id: volunteer.user_id._id,
            name: volunteer.user_id.full_name,
            distance: Math.round(distance)
          });
        } catch (notifErr) {
          console.error(`Failed to notify volunteer ${volunteer._id}:`, notifErr);
        }
      }
    }
  }

  return {
    rescueSession: savedSession,
    notifiedCount: notifiedVolunteers.length,
    notifiedVolunteers
  };
};

/**
 * Get active rescue requests that are nearby (within 5km) for a specific volunteer
 * @param {string} volunteerUserId - The user ID of the volunteer
 */
exports.getActiveRescueRequestsForVolunteer = async (volunteerUserId, options = {}) => {
  const { page = null, limit = null, status = 'all', search = '' } = options;
  const volunteer = await Volunteer.findOne({ user_id: volunteerUserId }).sort({ registered_at: -1 });

  const query = {
    $or: [
      { status: 'Pending', requester_id: { $ne: volunteerUserId } }
    ]
  };

  if (volunteer) {
    query.$or.push({
      status: { $in: ['Assigned', 'In_Progress', 'Arrived', 'Completed', 'Cancelled'] },
      assigned_volunteer_id: volunteer._id
    });
  }

  const rescueSessions = await RescueSession.find(query)
    .populate('requester_id', 'full_name phone avatar_url')
    .populate({
      path: 'assigned_volunteer_id',
      populate: { path: 'user_id', select: 'full_name phone avatar_url' }
    });

  let resultSessions = [];
  const MAX_RADIUS_METERS = 5000; // 5 km radius

  for (const session of rescueSessions) {
    const isAssignedToMe = volunteer && session.assigned_volunteer_id && session.assigned_volunteer_id._id.toString() === volunteer._id.toString();

    if (session.initial_lat != null && session.initial_lng != null) {
      if (!volunteer || volunteer.current_lat == null || volunteer.current_lng == null) {
        resultSessions.push({
          ...session.toObject(),
          distance: null
        });
        continue;
      }

      const distance = haversineDistance(
        parseFloat(volunteer.current_lat),
        parseFloat(volunteer.current_lng),
        parseFloat(session.initial_lat),
        parseFloat(session.initial_lng)
      );

      if (isAssignedToMe || distance <= MAX_RADIUS_METERS) {
        resultSessions.push({
          ...session.toObject(),
          distance: Math.round(distance)
        });
      }
    } else if (isAssignedToMe) {
      resultSessions.push({
        ...session.toObject(),
        distance: null
      });
    }
  }

  resultSessions.sort((a, b) => b.created_at - a.created_at);

  // Apply search filter if requested
  if (search && search.trim() !== '') {
    const cleanSearch = search.trim().toLowerCase();
    resultSessions = resultSessions.filter(s => {
      const victimName = s.requester_id?.full_name || '';
      const emergencyType = s.emergency_type || '';
      const customType = s.custom_emergency_type || '';
      const description = s.description || '';

      // Match friendly labels in both English and Vietnamese
      let friendlyType = '';
      if (emergencyType === 'Trapped_By_Flood') {
        friendlyType = 'trapped in flooded area stalled trapped in flood ngập lụt kẹt trong vùng lũ lũ lụt ngập nước';
      } else if (emergencyType === 'Medical') {
        friendlyType = 'urgent medical support needed medical assistance y tế cấp cứu sức khỏe bệnh tật tai nạn';
      } else if (emergencyType === 'Vehicle_Broken') {
        friendlyType = 'vehicle broken engine stalled due to flood emergency assistance hỏng xe chết máy xe hỏng xe cộ';
      } else {
        friendlyType = customType.toLowerCase();
      }

      return victimName.toLowerCase().includes(cleanSearch) ||
        emergencyType.toLowerCase().includes(cleanSearch) ||
        friendlyType.includes(cleanSearch) ||
        description.toLowerCase().includes(cleanSearch);
    });
  }

  // Calculate counts/stats before applying status filter
  const counts = {
    pending: resultSessions.filter(s => s.status === 'Pending').length,
    in_progress: resultSessions.filter(s => ['Assigned', 'In_Progress', 'Arrived'].includes(s.status)).length,
    resolved: resultSessions.filter(s => s.status === 'Completed').length,
    cancelled: resultSessions.filter(s => s.status === 'Cancelled').length
  };

  // Filter by status if requested
  if (status && status !== 'all') {
    resultSessions = resultSessions.filter(s => {
      const sStatus = s.status || 'Pending';
      if (status === 'Pending' || status === 'pending') return sStatus === 'Pending';
      if (status === 'Assigned' || status === 'accepted') return sStatus === 'Assigned';
      if (status === 'Processing' || status === 'in_progress') return sStatus === 'In_Progress' || sStatus === 'Arrived';
      if (status === 'Completed' || status === 'resolved') return sStatus === 'Completed';
      if (status === 'Cancelled' || status === 'cancelled') return sStatus === 'Cancelled';
      return sStatus.toLowerCase() === status.toLowerCase();
    });
  }

  const total = resultSessions.length;
  let paginatedSessions = resultSessions;
  let paginationInfo = null;

  if (page !== null && limit !== null) {
    const totalPages = Math.ceil(total / limit) || 1;
    const currentPage = Math.max(1, Math.min(page, totalPages));
    const startIdx = (currentPage - 1) * limit;
    paginatedSessions = resultSessions.slice(startIdx, startIdx + limit);
    paginationInfo = {
      total,
      page: currentPage,
      limit,
      totalPages
    };
  }

  return {
    data: paginatedSessions,
    pagination: paginationInfo,
    stats: counts
  };
};

/**
 * Accept a pending rescue request
 * @param {string} rescueSessionId - The ID of the rescue session
 * @param {string} volunteerUserId - The User ID of the accepting volunteer
 */
exports.acceptRescueRequest = async (rescueSessionId, volunteerUserId) => {
  const volunteer = await Volunteer.findOne({ user_id: volunteerUserId }).populate('user_id');
  if (!volunteer) {
    const err = new Error('Only registered volunteers can accept rescue requests.');
    err.status = 403;
    throw err;
  }

  // Check if volunteer has an uncompleted rescue mission
  const activeSession = await RescueSession.findOne({
    assigned_volunteer_id: volunteer._id,
    status: { $in: ['Assigned', 'In_Progress'] }
  });

  if (activeSession) {
    const err = new Error('You have an uncompleted rescue mission. Please complete your current mission before accepting a new one.');
    err.status = 400;
    throw err;
  }

  const rescueSession = await RescueSession.findById(rescueSessionId);
  if (!rescueSession) {
    const err = new Error('Rescue session not found.');
    err.status = 404;
    throw err;
  }

  if (rescueSession.status !== 'Pending') {
    const err = new Error('This rescue request has already been accepted by another volunteer.');
    err.status = 400;
    throw err;
  }

  rescueSession.status = 'Assigned';
  rescueSession.assigned_volunteer_id = volunteer._id;
  await rescueSession.save();

  try {
    const notification = new Notification({
      recipient_id: rescueSession.requester_id,
      title: 'Rescue request accepted',
      body: `Volunteer ${volunteer.user_id.full_name} has accepted your rescue request and is coordinating assistance.`,
      type: 'System_Alert',
      reference_type: 'rescue_sessions',
      reference_id: rescueSession._id,
      metadata: {
        web_url: '/sos',
        volunteer_name: volunteer.user_id.full_name,
        volunteer_phone: volunteer.user_id.phone || ''
      }
    });
    await notification.save();
  } catch (notifErr) {
    console.error('Failed to create notification for requester:', notifErr);
  }

  return rescueSession;
};

/**
 * Get current active rescue request for the user
 * @param {string} userId - The User ID of the requester
 */
exports.getCurrentRescueRequestForUser = async (userId) => {
  return await RescueSession.findOne({
    requester_id: userId,
    status: { $in: ['Pending', 'Assigned', 'In_Progress', 'Arrived'] }
  })
    .populate({
      path: 'assigned_volunteer_id',
      populate: { path: 'user_id', select: 'full_name phone avatar_url' }
    })
    .populate({
      path: 'assigned_staff_id',
      populate: { path: 'user_id', select: 'full_name phone avatar_url' }
    })
    .populate('workshop_id');
};

/**
 * Cancel an active rescue request
 * @param {string} rescueSessionId - The ID of the rescue session
 * @param {string} requesterUserId - The User ID of the requester (victim)
 */
exports.cancelRescueRequest = async (rescueSessionId, requesterUserId) => {
  const rescueSession = await RescueSession.findById(rescueSessionId);
  if (!rescueSession) {
    const err = new Error('Rescue session not found.');
    err.status = 404;
    throw err;
  }

  if (rescueSession.requester_id.toString() !== requesterUserId.toString()) {
    const err = new Error('You do not have permission to cancel this rescue request.');
    err.status = 403;
    throw err;
  }

  rescueSession.status = 'Cancelled';
  rescueSession.completed_at = new Date();
  await rescueSession.save();

  // Also cancel any other pending sessions for this user to ensure a clean state
  await RescueSession.updateMany(
    { requester_id: requesterUserId, status: 'Pending', _id: { $ne: rescueSession._id } },
    { status: 'Cancelled', completed_at: new Date() }
  );

  if (rescueSession.assigned_volunteer_id) {
    try {
      const volunteer = await Volunteer.findById(rescueSession.assigned_volunteer_id);
      if (volunteer) {
        const wsHelper = require('../../utils/wsHelper');
        wsHelper.sendToUser(volunteer.user_id, {
          type: 'rescue_status_update',
          rescueSessionId: rescueSession._id,
          status: 'Cancelled'
        });

        const notification = new Notification({
          recipient_id: volunteer.user_id,
          title: 'Rescue mission cancelled',
          body: 'The user has cancelled their rescue request.',
          type: 'System_Alert',
          reference_type: 'rescue_sessions',
          reference_id: rescueSession._id,
          metadata: {
            web_url: '/missions'
          }
        });
        await notification.save();
      }
    } catch (notifErr) {
      console.error('Failed to notify volunteer of cancellation:', notifErr);
    }
  }

  // Notify emergency contacts when rescue request is cancelled
  try {
    const User = require('../../models/User');
    const fullRequester = await User.findById(requesterUserId).populate('emergency_contacts.user_id');
    if (fullRequester && fullRequester.emergency_contacts && fullRequester.emergency_contacts.length > 0) {
      const wsHelper = require('../../utils/wsHelper');
      for (const contact of fullRequester.emergency_contacts) {
        const contactId = contact.user_id?._id || contact.user_id;
        if (!contactId) continue;
        try {
          const createdNotif = await Notification.create({
            recipient_id: contactId,
            recipient_role: 'User',
            title: `Emergency SOS Cancelled (${fullRequester.full_name})`,
            body: `${fullRequester.full_name} has cancelled their emergency SOS signal. They may no longer need assistance.`,
            type: 'Emergency_SOS_Contact',
            reference_id: rescueSession._id,
            reference_type: 'rescue_sessions',
            metadata: {
              sender_name: fullRequester.full_name,
              avatar_url: fullRequester.avatar_url || '',
              web_url: '/sos',
              app_params: {
                status: 'Cancelled',
                rescueSessionId: rescueSession._id.toString()
              }
            }
          });

          try {
            wsHelper.sendToUser(contactId, {
              type: 'notification',
              notification: createdNotif
            });
          } catch (wsErr) {
            console.error(`Failed to send WebSocket cancel notification to ${contactId}:`, wsErr);
          }
        } catch (contactNotifErr) {
          console.error(`Failed to notify contact ${contactId} on cancel:`, contactNotifErr);
        }
      }
    }
  } catch (err) {
    console.error('Error notifying contacts on cancel:', err);
  }

  return rescueSession;
};

/**
 * Start moving to the rescue scene (volunteer or workshop staff)
 * @param {string} rescueSessionId - The ID of the rescue session
 * @param {string} volunteerUserId - The User ID of the volunteer/staff
 */
exports.startRescueRequest = async (rescueSessionId, volunteerUserId) => {
  const rescueSession = await RescueSession.findById(rescueSessionId);
  if (!rescueSession) {
    const err = new Error('Rescue session not found.');
    err.status = 404;
    throw err;
  }

  let helperName = '';

  if (rescueSession.workshop_id) {
    const WorkshopStaff = require('../../models/WorkshopStaff');
    const staff = await WorkshopStaff.findOne({ user_id: volunteerUserId, workshop_id: rescueSession.workshop_id });
    if (!staff) {
      const err = new Error('Only registered workshop staff can update repair status.');
      err.status = 403;
      throw err;
    }
    const User = require('../../models/User');
    const userDoc = await User.findById(volunteerUserId);
    helperName = userDoc ? userDoc.full_name : 'Workshop Staff';
  } else {
    const volunteer = await Volunteer.findOne({ user_id: volunteerUserId }).populate('user_id');
    if (!volunteer) {
      const err = new Error('Only registered volunteers can update rescue status.');
      err.status = 403;
      throw err;
    }
    if (!rescueSession.assigned_volunteer_id || rescueSession.assigned_volunteer_id.toString() !== volunteer._id.toString()) {
      const err = new Error('You are not assigned to this rescue request.');
      err.status = 403;
      throw err;
    }
    helperName = volunteer.user_id.full_name;
  }

  rescueSession.status = 'In_Progress';
  await rescueSession.save();

  try {
    const notification = new Notification({
      recipient_id: rescueSession.requester_id,
      title: rescueSession.workshop_id ? 'Workshop staff is moving' : 'Volunteer is moving',
      body: rescueSession.workshop_id
        ? `Staff ${helperName} is moving to your location for repair.`
        : `Volunteer ${helperName} is moving to your location.`,
      type: 'System_Alert',
      reference_type: 'rescue_sessions',
      reference_id: rescueSession._id,
      metadata: {
        web_url: '/sos'
      }
    });
    await notification.save();
  } catch (notifErr) {
    console.error('Failed to notify requester of movement:', notifErr);
  }

  return rescueSession;
};

/**
 * Arrive at the rescue scene (volunteer or workshop staff)
 * @param {string} rescueSessionId - The ID of the rescue session
 * @param {string} volunteerUserId - The User ID of the volunteer/staff
 */
exports.arriveRescueRequest = async (rescueSessionId, volunteerUserId) => {
  const rescueSession = await RescueSession.findById(rescueSessionId);
  if (!rescueSession) {
    const err = new Error('Rescue session not found.');
    err.status = 404;
    throw err;
  }

  let helperName = '';

  if (rescueSession.workshop_id) {
    const WorkshopStaff = require('../../models/WorkshopStaff');
    const staff = await WorkshopStaff.findOne({ user_id: volunteerUserId, workshop_id: rescueSession.workshop_id });
    if (!staff) {
      const err = new Error('Only registered workshop staff can update repair status.');
      err.status = 403;
      throw err;
    }
    const User = require('../../models/User');
    const userDoc = await User.findById(volunteerUserId);
    helperName = userDoc ? userDoc.full_name : 'Workshop Staff';
  } else {
    const volunteer = await Volunteer.findOne({ user_id: volunteerUserId }).populate('user_id');
    if (!volunteer) {
      const err = new Error('Only registered volunteers can update rescue status.');
      err.status = 403;
      throw err;
    }
    if (!rescueSession.assigned_volunteer_id || rescueSession.assigned_volunteer_id.toString() !== volunteer._id.toString()) {
      const err = new Error('You are not assigned to this rescue request.');
      err.status = 403;
      throw err;
    }
    helperName = volunteer.user_id.full_name;
  }

  rescueSession.status = 'Arrived';
  await rescueSession.save();

  try {
    const notification = new Notification({
      recipient_id: rescueSession.requester_id,
      title: rescueSession.workshop_id ? 'Workshop staff arrived' : 'Volunteer arrived',
      body: rescueSession.workshop_id
        ? `Staff ${helperName} has arrived at your location and is repairing.`
        : `Volunteer ${helperName} has arrived at your location and is assisting.`,
      type: 'System_Alert',
      reference_type: 'rescue_sessions',
      reference_id: rescueSession._id,
      metadata: {
        web_url: '/sos'
      }
    });
    await notification.save();
  } catch (notifErr) {
    console.error('Failed to notify requester of arrival:', notifErr);
  }

  return rescueSession;
};

/**
 * Complete a rescue request (volunteer or workshop staff)
 * @param {string} rescueSessionId - The ID of the rescue session
 * @param {string} volunteerUserId - The User ID of the volunteer/staff
 */
exports.completeRescueRequest = async (rescueSessionId, volunteerUserId) => {
  const rescueSession = await RescueSession.findById(rescueSessionId);
  if (!rescueSession) {
    const err = new Error('Rescue session not found.');
    err.status = 404;
    throw err;
  }

  let helperName = '';

  if (rescueSession.workshop_id) {
    const WorkshopStaff = require('../../models/WorkshopStaff');
    const staff = await WorkshopStaff.findOne({ user_id: volunteerUserId, workshop_id: rescueSession.workshop_id });
    if (!staff) {
      const err = new Error('Only registered workshop staff can update repair status.');
      err.status = 403;
      throw err;
    }
    const User = require('../../models/User');
    const userDoc = await User.findById(volunteerUserId);
    helperName = userDoc ? userDoc.full_name : 'Workshop Staff';
  } else {
    const volunteer = await Volunteer.findOne({ user_id: volunteerUserId });
    if (!volunteer) {
      const err = new Error('Only registered volunteers can update rescue status.');
      err.status = 403;
      throw err;
    }
    if (!rescueSession.assigned_volunteer_id || rescueSession.assigned_volunteer_id.toString() !== volunteer._id.toString()) {
      const err = new Error('You are not assigned to this rescue request.');
      err.status = 403;
      throw err;
    }
    const User = require('../../models/User');
    const userDoc = await User.findById(volunteer.user_id);
    helperName = userDoc ? userDoc.full_name : 'Volunteer';
  }

  const wasCompleted = rescueSession.status === 'Completed';
  rescueSession.status = 'Completed';
  rescueSession.completed_at = new Date();
  await rescueSession.save();

  if (!wasCompleted) {
    // await awardRescuePoints(rescueSession);
  }

  try {
    const notification = new Notification({
      recipient_id: rescueSession.requester_id,
      title: rescueSession.workshop_id ? 'Repair completed' : 'Rescue completed',
      body: rescueSession.workshop_id
        ? `Staff ${helperName} has completed the vehicle repair.`
        : `Volunteer ${helperName} has completed the rescue request.`,
      type: 'System_Alert',
      reference_type: 'rescue_sessions',
      reference_id: rescueSession._id,
      metadata: {
        web_url: '/sos'
      }
    });
    await notification.save();
  } catch (notifErr) {
    console.error('Failed to notify requester of completion:', notifErr);
  }

  return rescueSession;
};

/**
 * Confirm safety of the victim and complete the rescue session
 * @param {string} rescueSessionId - The ID of the rescue session
 * @param {string} requesterUserId - The User ID of the requester (victim)
 * @param {Array} safePhotos - Optional array of base64 images of safety status
 */
exports.confirmSafety = async (rescueSessionId, requesterUserId, safePhotos) => {
  const rescueSession = await RescueSession.findById(rescueSessionId);
  if (!rescueSession) {
    const err = new Error('Rescue session not found.');
    err.status = 404;
    throw err;
  }

  if (rescueSession.requester_id.toString() !== requesterUserId.toString()) {
    const err = new Error('You are not authorized to confirm safety for this rescue request.');
    err.status = 403;
    throw err;
  }

  const wasCompleted = rescueSession.status === 'Completed';
  rescueSession.safe_checked_in = true;
  rescueSession.status = 'Completed';
  rescueSession.completed_at = new Date();
  if (safePhotos && safePhotos.length > 0) {
    rescueSession.safe_photos = JSON.stringify(safePhotos);
  }
  await rescueSession.save();

  if (!wasCompleted) {
    // await awardRescuePoints(rescueSession);
  }

  // Also complete/close any other pending sessions for this user to ensure clean state
  await RescueSession.updateMany(
    { requester_id: requesterUserId, status: { $in: ['Pending', 'In_Progress'] }, _id: { $ne: rescueSession._id } },
    { status: 'Completed', completed_at: new Date() }
  );

  // If there is an assigned volunteer, notify them
  if (rescueSession.assigned_volunteer_id) {
    try {
      const volunteer = await Volunteer.findById(rescueSession.assigned_volunteer_id);
      if (volunteer) {
        const wsHelper = require('../../utils/wsHelper');
        wsHelper.sendToUser(volunteer.user_id, {
          type: 'rescue_status_update',
          rescueSessionId: rescueSession._id,
          status: 'Completed'
        });

        const notification = new Notification({
          recipient_id: volunteer.user_id,
          title: 'Rescue mission completed',
          body: 'The victim has confirmed they are safe and marked the mission as completed.',
          type: 'System_Alert',
          reference_type: 'rescue_sessions',
          reference_id: rescueSession._id,
          metadata: {
            web_url: '/missions'
          }
        });
        await notification.save();
      }
    } catch (notifErr) {
      console.error('Failed to notify volunteer of safety confirmation:', notifErr);
    }
  }

  // If there is an assigned workshop staff, notify them
  if (rescueSession.assigned_staff_id) {
    try {
      const WorkshopStaff = require('../../models/WorkshopStaff');
      const staff = await WorkshopStaff.findById(rescueSession.assigned_staff_id);
      if (staff) {
        const wsHelper = require('../../utils/wsHelper');
        wsHelper.sendToUser(staff.user_id, {
          type: 'rescue_status_update',
          rescueSessionId: rescueSession._id,
          status: 'Completed'
        });

        const notification = new Notification({
          recipient_id: staff.user_id,
          title: 'Repair request completed',
          body: 'The customer has confirmed safety / repair completion.',
          type: 'System_Alert',
          reference_type: 'rescue_sessions',
          reference_id: rescueSession._id,
          metadata: {
            web_url: '/tasks'
          }
        });
        await notification.save();
      }
    } catch (notifErr) {
      console.error('Failed to notify staff of safety confirmation:', notifErr);
    }
  }

  // Notify emergency contacts when user confirms safety
  try {
    const User = require('../../models/User');
    const fullRequester = await User.findById(requesterUserId).populate('emergency_contacts.user_id');
    if (fullRequester && fullRequester.emergency_contacts && fullRequester.emergency_contacts.length > 0) {
      const wsHelper = require('../../utils/wsHelper');
      for (const contact of fullRequester.emergency_contacts) {
        const contactId = contact.user_id?._id || contact.user_id;
        if (!contactId) continue;
        try {
          const createdNotif = await Notification.create({
            recipient_id: contactId,
            recipient_role: 'User',
            title: `Safe & Confirmed (${fullRequester.full_name})`,
            body: `${fullRequester.full_name} has confirmed they are safe and out of danger! The emergency mission is completed.`,
            type: 'Emergency_SOS_Contact',
            reference_id: rescueSession._id,
            reference_type: 'rescue_sessions',
            metadata: {
              sender_name: fullRequester.full_name,
              avatar_url: fullRequester.avatar_url || '',
              web_url: '/sos',
              app_params: {
                status: 'Completed',
                rescueSessionId: rescueSession._id.toString()
              }
            }
          });

          try {
            wsHelper.sendToUser(contactId, {
              type: 'notification',
              notification: createdNotif
            });
          } catch (wsErr) {
            console.error(`Failed to send WebSocket safety confirmation to ${contactId}:`, wsErr);
          }
        } catch (contactNotifErr) {
          console.error(`Failed to notify contact ${contactId} on confirm safety:`, contactNotifErr);
        }
      }
    }
  } catch (err) {
    console.error('Error notifying contacts on confirm safety:', err);
  }

  return rescueSession;
};

//Get all the rescue request assign to workshop 
exports.getWorkshopRescueSessions = async (userId, options = {}) => {
  const { page = null, limit = null, status = 'all', search = '' } = options;
  const WorkshopStaff = require('../../models/WorkshopStaff');
  const Workshop = require('../../models/Workshop');
  const staffLink = await WorkshopStaff.findOne({
    user_id: userId,
    status: { $in: ['Available', 'Busy'] }
  }).sort({ _id: -1 });
  if (!staffLink) {
    return { data: [], pagination: null };
  }

  const workshop = await Workshop.findById(staffLink.workshop_id).lean();

  const sessions = await RescueSession.find({
    workshop_id: staffLink.workshop_id
  })
    .populate('requester_id', 'full_name phone avatar_url')
    .populate({
      path: 'assigned_staff_id',
      populate: { path: 'user_id', select: 'full_name phone avatar_url' }
    })
    .sort({ created_at: -1 })
    .lean();

  let mappedSessions = sessions.map(s => {
    const priority = s.emergency_type === 'Medical' || s.emergency_type === 'Trapped_By_Flood' ? 'urgent' : 'normal';

    let mappedStatus = 'pending';
    if (s.status === 'Assigned') mappedStatus = 'assigned';
    else if (s.status === 'In_Progress') mappedStatus = 'in_progress';
    else if (s.status === 'Arrived') mappedStatus = 'arrived';
    else if (s.status === 'Completed') mappedStatus = 'completed';
    else if (s.status === 'Cancelled') mappedStatus = 'cancelled';

    let distanceStr = 'Unknown';
    let etaStr = 'Unknown';
    let startLat = null;
    let startLng = null;

    if (s.assigned_staff_id && s.assigned_staff_id.current_lat != null && s.assigned_staff_id.current_lng != null) {
      startLat = s.assigned_staff_id.current_lat;
      startLng = s.assigned_staff_id.current_lng;
    } else if (workshop && workshop.lat != null && workshop.lng != null) {
      startLat = workshop.lat;
      startLng = workshop.lng;
    }

    if (startLat != null && startLng != null && s.initial_lat != null && s.initial_lng != null) {
      const distMeters = haversineDistance(startLat, startLng, s.initial_lat, s.initial_lng);
      if (distMeters < 1000) {
        distanceStr = `${Math.round(distMeters)} m`;
      } else {
        distanceStr = `${(distMeters / 1000).toFixed(1)} km`;
      }
      const minutes = Math.max(1, Math.round(distMeters / 400));
      etaStr = `${minutes} mins`;
    }

    const servicesList = s.selected_services || [];

    const serviceName = servicesList.map(srv => srv.service_name).join(', ') || s.emergency_type || 'Mobile repair';
    const totalPrice = servicesList.reduce((sum, srv) => sum + (srv.base_price || 0), 0);

    return {
      id: s._id.toString(),
      customer: s.requester_id?.full_name || 'Customer',
      phone: s.sender_phone || s.requester_id?.phone || '',
      service: serviceName,
      selected_services: servicesList,
      total_price: totalPrice,
      location: s.initial_lat != null && s.initial_lng != null ? `${s.initial_lat.toFixed(4)}° N, ${s.initial_lng.toFixed(4)}° E` : 'Unknown',
      lat: s.initial_lat,
      lng: s.initial_lng,
      distance: distanceStr,
      eta: etaStr,
      priority,
      status: mappedStatus,
      rawStatus: s.status,
      time: new Date(s.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
      mechanic: s.assigned_staff_id?.user_id?.full_name || null,
      assignedStaffUserId: s.assigned_staff_id?.user_id?._id || null,
      isPaid: s.is_paid || false,
      requesterUserId: s.requester_id?._id || null,
      note: s.description || '',
      photos: s.photos ? JSON.parse(s.photos) : []
    };
  });

  // Apply search filter if requested
  if (search && search.trim() !== '') {
    const cleanSearch = search.trim().toLowerCase();
    mappedSessions = mappedSessions.filter(s => {
      const customerName = s.customer || '';
      const staffName = s.mechanic || '';
      const phone = s.phone || '';

      return customerName.toLowerCase().includes(cleanSearch) ||
        staffName.toLowerCase().includes(cleanSearch) ||
        phone.toLowerCase().includes(cleanSearch);
    });
  }

  // Calculate counts/stats before applying status filter
  const counts = {
    pending: mappedSessions.filter(t => t.status === 'pending').length,
    assigned: mappedSessions.filter(t => t.status === 'assigned').length,
    in_progress: mappedSessions.filter(t => t.status === 'in_progress').length,
    completed: mappedSessions.filter(t => t.status === 'completed').length
  };

  // Filter by status if requested
  if (status && status !== 'all') {
    mappedSessions = mappedSessions.filter(task => {
      if (status === 'paid') return task.isPaid === true;
      if (status === 'unpaid') return task.isPaid === false;
      return task.status === status;
    });
  }

  const total = mappedSessions.length;
  let paginatedSessions = mappedSessions;
  let paginationInfo = null;

  if (page !== null && limit !== null) {
    const totalPages = Math.ceil(total / limit) || 1;
    const currentPage = Math.max(1, Math.min(page, totalPages));
    const startIdx = (currentPage - 1) * limit;
    paginatedSessions = mappedSessions.slice(startIdx, startIdx + limit);
    paginationInfo = {
      total,
      page: currentPage,
      limit,
      totalPages
    };
  }

  return {
    data: paginatedSessions,
    pagination: paginationInfo,
    stats: counts
  };
};

exports.assignWorkshopStaff = async (rescueSessionId, staffUserId, assigningUserId) => {
  const WorkshopStaff = require('../../models/WorkshopStaff');
  const User = require('../../models/User');

  const rescueSession = await RescueSession.findById(rescueSessionId);
  if (!rescueSession) {
    const err = new Error('Rescue session not found.');
    err.status = 404;
    throw err;
  }

  const assigner = await WorkshopStaff.findOne({ user_id: assigningUserId, workshop_id: rescueSession.workshop_id });
  if (!assigner) {
    const err = new Error('You do not have permission to assign staff for this workshop.');
    err.status = 403;
    throw err;
  }

  const staff = await WorkshopStaff.findOne({ user_id: staffUserId, workshop_id: rescueSession.workshop_id });
  if (!staff) {
    const err = new Error('Selected staff member does not belong to this workshop.');
    err.status = 400;
    throw err;
  }

  rescueSession.status = 'Assigned';
  rescueSession.assigned_staff_id = staff._id;
  await rescueSession.save();

  try {
    const staffUser = await User.findById(staffUserId);
    const notification = new Notification({
      recipient_id: rescueSession.requester_id,
      title: 'Workshop request accepted',
      body: `Workshop has assigned staff ${staffUser.full_name} to your repair request.`,
      type: 'System_Alert',
      reference_type: 'rescue_sessions',
      reference_id: rescueSession._id,
      metadata: {
        web_url: '/sos',
        volunteer_name: staffUser.full_name,
        volunteer_phone: staffUser.phone || ''
      }
    });
    await notification.save();
  } catch (notifErr) {
    console.error('Failed to notify requester of assignment:', notifErr);
  }

  return rescueSession;
};

exports.confirmPayment = async (rescueSessionId, userId) => {
  const rescueSession = await RescueSession.findById(rescueSessionId);
  if (!rescueSession) {
    const err = new Error('Rescue session not found.');
    err.status = 404;
    throw err;
  }

  const WorkshopStaff = require('../../models/WorkshopStaff');
  const staff = await WorkshopStaff.findOne({ user_id: userId, workshop_id: rescueSession.workshop_id });
  if (!staff) {
    const err = new Error('You do not have permission to confirm payment for this workshop task.');
    err.status = 403;
    throw err;
  }

  rescueSession.is_paid = true;
  await rescueSession.save();
  return rescueSession;
};

exports.getMyRescueHistory = async (userId, { page = 1, limit = 10, sort = 'newest', type = 'all', status = 'all', search = '' }) => {
  const query = { requester_id: userId };

  if (type === 'repair') {
    query.emergency_type = 'Vehicle_Broken';
  } else if (type === 'rescue') {
    query.emergency_type = { $in: ['Trapped_By_Flood', 'Medical', 'Other'] };
  }

  if (status === 'completed') {
    query.status = 'Completed';
  } else if (status === 'cancelled') {
    query.status = 'Cancelled';
  }

  if (search && search.trim()) {
    const searchRegex = new RegExp(search.trim(), 'i');
    
    // Find matching users (volunteers or staff)
    const User = require('../../models/User');
    const matchingUsers = await User.find({
      $or: [
        { full_name: searchRegex },
        { phone: searchRegex }
      ]
    }).select('_id').lean();
    const matchingUserIds = matchingUsers.map(u => u._id);

    // Find matching volunteers
    const Volunteer = require('../../models/Volunteer');
    const matchingVolunteers = await Volunteer.find({
      user_id: { $in: matchingUserIds }
    }).select('_id').lean();
    const matchingVolunteerIds = matchingVolunteers.map(v => v._id);

    // Find matching workshop staff
    const WorkshopStaff = require('../../models/WorkshopStaff');
    const matchingStaff = await WorkshopStaff.find({
      user_id: { $in: matchingUserIds }
    }).select('_id').lean();
    const matchingStaffIds = matchingStaff.map(s => s._id);

    // Find matching workshops
    const Workshop = require('../../models/Workshop');
    const matchingWorkshops = await Workshop.find({
      name: searchRegex
    }).select('_id').lean();
    const matchingWorkshopIds = matchingWorkshops.map(w => w._id);

    query.$or = [
      { description: searchRegex },
      { custom_emergency_type: searchRegex },
      { emergency_type: searchRegex },
      { assigned_volunteer_id: { $in: matchingVolunteerIds } },
      { assigned_staff_id: { $in: matchingStaffIds } },
      { workshop_id: { $in: matchingWorkshopIds } }
    ];
  }

  const total = await RescueSession.countDocuments(query);
  const totalPages = Math.ceil(total / limit) || 1;
  const currentPage = Math.max(1, Math.min(page, totalPages));
  const skip = (currentPage - 1) * limit;

  const sortOption = sort === 'oldest' ? { created_at: 1 } : { created_at: -1 };

  const data = await RescueSession.find(query)
    .sort(sortOption)
    .skip(skip)
    .limit(limit)
    .populate({
      path: 'assigned_volunteer_id',
      populate: { path: 'user_id', select: 'full_name phone avatar_url' }
    })
    .populate({
      path: 'assigned_staff_id',
      populate: { path: 'user_id', select: 'full_name phone avatar_url' }
    })
    .populate('workshop_id');

  return {
    data,
    pagination: {
      total,
      page: currentPage,
      limit,
      totalPages
    }
  };
};

