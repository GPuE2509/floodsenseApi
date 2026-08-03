const Workshop = require('../../models/Workshop');
const WorkshopStaff = require('../../models/WorkshopStaff');
const User = require('../../models/User');
const { deleteImage, uploadImage } = require('../../utils/uploadCloudinary');

function checkCurrentlyOpen(w) {
  if (!w.is_open) return false;

  const hasActiveCalendar = w.weekly_calendar && w.weekly_calendar.some(c => c.is_active);

  // Get current Vietnam time (GMT+7)
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const vnTime = new Date(utc + (3600000 * 7));

  const currentHours = vnTime.getHours();
  const currentMinutes = vnTime.getMinutes();
  const currentMinVal = currentHours * 60 + currentMinutes;

  if (!hasActiveCalendar) {
    const [oH, oM] = (w.open_time || '08:00').split(':').map(Number);
    const [cH, cM] = (w.close_time || '17:00').split(':').map(Number);
    const openMinVal = oH * 60 + oM;
    const closeMinVal = cH * 60 + cM;
    return currentMinVal >= openMinVal && currentMinVal <= closeMinVal;
  }

  const day = vnTime.getDay(); // 0: Sunday, 1: Monday, ..., 6: Saturday
  let dayGroup = "";
  if (day === 0) {
    dayGroup = "Sunday";
  } else if (day === 6) {
    dayGroup = "Saturday";
  } else {
    dayGroup = "Monday – Friday";
  }

  const calendarEntry = w.weekly_calendar.find(c => c.day_group === dayGroup);
  if (!calendarEntry) return true;
  if (!calendarEntry.is_active) return false;

  const [oH, oM] = (calendarEntry.open_time || '08:00').split(':').map(Number);
  const [cH, cM] = (calendarEntry.close_time || '17:00').split(':').map(Number);

  const openMinVal = oH * 60 + oM;
  const closeMinVal = cH * 60 + cM;

  return currentMinVal >= openMinVal && currentMinVal <= closeMinVal;
}

exports.getWorkshop = async (userOrId) => {
  let user;
  let userId;
  if (userOrId && typeof userOrId === 'object' && userOrId._id) {
    user = userOrId;
    userId = user._id;
  } else {
    userId = userOrId;
  }

  const staffLinks = await WorkshopStaff.find({ user_id: userId, status: { $in: ['Available', 'Busy', 'Suspended'] } });
  
  let workshop = null;
  if (staffLinks.length > 0) {
    const workshopIds = staffLinks.map(link => link.workshop_id);
    const workshops = await Workshop.find({
      _id: { $in: workshopIds },
      status: { $in: ['Active', 'Pending_Approval', 'Suspended'] }
    });
    
    if (workshops.length > 0) {
      // Prioritize Active over Pending_Approval and Suspended
      workshop = workshops.find(w => w.status === 'Active') ||
                 workshops.find(w => w.status === 'Pending_Approval') ||
                 workshops.find(w => w.status === 'Suspended');
    }
  }

  if (!workshop) {
    const error = new Error('Could not find your workshop information.');
    error.status = 404;
    throw error;
  }

  // Get owner details (User's full_name)
  if (!user) {
    user = await User.findById(userId);
  }
  const ownerName = user ? user.full_name : '';
  const ownerEmail = user ? user.email : '';
  const ownerPhone = user ? user.phone : '';

  const userStaffLink = staffLinks.find(link => String(link.workshop_id) === String(workshop._id));
  const isOwner = userStaffLink ? userStaffLink.is_owner : false;

  return {
    ...workshop.toObject(),
    owner_name: ownerName,
    owner_email: ownerEmail,
    owner_phone: ownerPhone,
    isOwner: isOwner
  };
};

exports.updateWorkshop = async (userId, updateData) => {
  const staffLinks = await WorkshopStaff.find({ user_id: userId, is_owner: true });
  
  let activeWorkshop = null;
  for (const staffLink of staffLinks) {
    const workshop = await Workshop.findById(staffLink.workshop_id);
    if (workshop && ['Active', 'Pending_Approval', 'Suspended'].includes(workshop.status)) {
      activeWorkshop = workshop;
      break;
    }
  }

  if (!activeWorkshop) {
    const error = new Error('Could not find your workshop information.');
    error.status = 404;
    throw error;
  }

  if (updateData.name !== undefined) {
    if (!updateData.name.trim()) {
      const error = new Error('Workshop name is required.');
      error.status = 400;
      throw error;
    }
    activeWorkshop.name = updateData.name.trim();
  }

  if (updateData.phone !== undefined) {
    if (!updateData.phone.trim()) {
      const error = new Error('Phone number is required.');
      error.status = 400;
      throw error;
    }
    // Mobile number validation
    const phoneRegex = /^(03[2-9]|05[25689]|07[06-9]|08[1-9]|09[0-9])\d{7}$/;
    if (!phoneRegex.test(updateData.phone.trim())) {
      const error = new Error('Invalid Vietnamese mobile phone number.');
      error.status = 400;
      throw error;
    }
    activeWorkshop.phone = updateData.phone.trim();
  }

  if (updateData.address !== undefined) {
    if (!updateData.address.trim()) {
      const error = new Error('Address is required.');
      error.status = 400;
      throw error;
    }
    activeWorkshop.address = updateData.address.trim();
  }

  if (updateData.lat !== undefined) {
    const latVal = parseFloat(updateData.lat);
    if (isNaN(latVal) || latVal < -90 || latVal > 90) {
      const error = new Error('Invalid latitude.');
      error.status = 400;
      throw error;
    }
    activeWorkshop.lat = latVal;
  }
  
  if (updateData.lng !== undefined) {
    const lngVal = parseFloat(updateData.lng);
    if (isNaN(lngVal) || lngVal < -180 || lngVal > 180) {
      const error = new Error('Invalid longitude.');
      error.status = 400;
      throw error;
    }
    activeWorkshop.lng = lngVal;
  }

  if (updateData.is_open !== undefined) {
    activeWorkshop.is_open = !!updateData.is_open;
  }

  if (updateData.open_time !== undefined || updateData.close_time !== undefined) {
    const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
    const newOpenTime = updateData.open_time !== undefined ? updateData.open_time.trim() : activeWorkshop.open_time;
    const newCloseTime = updateData.close_time !== undefined ? updateData.close_time.trim() : activeWorkshop.close_time;

    if (updateData.open_time !== undefined) {
      if (!newOpenTime) {
        const error = new Error('Open time is required.');
        error.status = 400;
        throw error;
      }
      if (!timeRegex.test(newOpenTime)) {
        const error = new Error('Invalid open time format (must be HH:MM).');
        error.status = 400;
        throw error;
      }
    }

    if (updateData.close_time !== undefined) {
      if (!newCloseTime) {
        const error = new Error('Close time is required.');
        error.status = 400;
        throw error;
      }
      if (!timeRegex.test(newCloseTime)) {
        const error = new Error('Invalid close time format (must be HH:MM).');
        error.status = 400;
        throw error;
      }
    }

    const [openH, openM] = newOpenTime.split(':').map(Number);
    const [closeH, closeM] = newCloseTime.split(':').map(Number);
    const openMin = openH * 60 + openM;
    const closeMin = closeH * 60 + closeM;

    if (openMin >= closeMin) {
      const error = new Error('Open time must be earlier than close time.');
      error.status = 400;
      throw error;
    }

    if (updateData.open_time !== undefined) activeWorkshop.open_time = newOpenTime;
    if (updateData.close_time !== undefined) activeWorkshop.close_time = newCloseTime;
  }

  if (updateData.is_mobile !== undefined) {
    activeWorkshop.is_mobile = !!updateData.is_mobile;
  }

  if (updateData.coverage_radius !== undefined) {
    const radiusVal = parseInt(updateData.coverage_radius, 10);
    if (isNaN(radiusVal) || radiusVal < 1 || radiusVal > 100) {
      const error = new Error('Invalid service radius.');
      error.status = 400;
      throw error;
    }
    activeWorkshop.coverage_radius = radiusVal;
  }

  if (updateData.cover_photo !== undefined) {
    activeWorkshop.cover_photo = updateData.cover_photo;
  }

  if (updateData.weekly_calendar !== undefined) {
    if (!Array.isArray(updateData.weekly_calendar)) {
      const error = new Error('Weekly calendar must be an array.');
      error.status = 400;
      throw error;
    }
    const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
    for (const item of updateData.weekly_calendar) {
      if (!item.day_group) {
        const error = new Error('Day group name is required in calendar.');
        error.status = 400;
        throw error;
      }
      const openT = item.open_time || '08:00';
      const closeT = item.close_time || '17:00';
      if (!timeRegex.test(openT.trim())) {
        const error = new Error(`Invalid open time format for ${item.day_group}.`);
        error.status = 400;
        throw error;
      }
      if (!timeRegex.test(closeT.trim())) {
        const error = new Error(`Invalid close time format for ${item.day_group}.`);
        error.status = 400;
        throw error;
      }
      const [oH, oM] = openT.split(':').map(Number);
      const [cH, cM] = closeT.split(':').map(Number);
      if (oH * 60 + oM >= cH * 60 + cM) {
        const error = new Error(`Open time must be earlier than close time for ${item.day_group}.`);
        error.status = 400;
        throw error;
      }
    }
    activeWorkshop.weekly_calendar = updateData.weekly_calendar.map(item => ({
      day_group: item.day_group.trim(),
      open_time: (item.open_time || '08:00').trim(),
      close_time: (item.close_time || '17:00').trim(),
      is_active: item.is_active !== undefined ? !!item.is_active : true
    }));
  }

  await activeWorkshop.save();

  // Also update staff link's workshop_name to match the new name
  if (updateData.name !== undefined) {
    await WorkshopStaff.updateMany(
      { workshop_id: activeWorkshop._id },
      { workshop_name: activeWorkshop.name }
    );
  }

  return activeWorkshop;
};

exports.addService = async (userId, serviceData) => {
  const staffLinks = await WorkshopStaff.find({ user_id: userId, is_owner: true });
  
  let activeWorkshop = null;
  for (const staffLink of staffLinks) {
    const workshop = await Workshop.findById(staffLink.workshop_id);
    if (workshop && ['Active', 'Pending_Approval', 'Suspended'].includes(workshop.status)) {
      activeWorkshop = workshop;
      break;
    }
  }

  if (!activeWorkshop) {
    const error = new Error('You do not have a valid, active workshop to update.');
    error.status = 404;
    throw error;
  }

  const cleanName = serviceData.name ? serviceData.name.replace(/\s+/g, ' ').trim() : '';
  if (!cleanName) {
    const error = new Error('Service name is required.');
    error.status = 400;
    throw error;
  }
  if (cleanName.length > 100) {
    const error = new Error('Service name cannot exceed 100 characters.');
    error.status = 400;
    throw error;
  }

  const rawPriceStr = serviceData.price !== undefined ? serviceData.price.toString().replace(/\D/g, '') : '';
  if (!rawPriceStr || isNaN(parseFloat(rawPriceStr)) || parseFloat(rawPriceStr) < 1000) {
    const error = new Error('Valid service price is required and must be at least 1,000 VND.');
    error.status = 400;
    throw error;
  }
  if (rawPriceStr.length > 15) {
    const error = new Error('Service price cannot exceed 15 digits.');
    error.status = 400;
    throw error;
  }

  const cleanDesc = serviceData.desc ? serviceData.desc.replace(/\s+/g, ' ').trim() : '';
  if (cleanDesc.length > 300) {
    const error = new Error('Service description cannot exceed 300 characters.');
    error.status = 400;
    throw error;
  }

  const newService = {
    id: serviceData.id || `s${Date.now()}`,
    service_name: cleanName,
    base_price: parseFloat(rawPriceStr),
    category: serviceData.category || 'Basic repair',
    unit: serviceData.unit || 'turn',
    desc: cleanDesc,
    active: serviceData.active !== undefined ? serviceData.active : true
  };

  // Ensure services array exists
  if (!activeWorkshop.services) {
    activeWorkshop.services = [];
  }
  
  activeWorkshop.services.push(newService);
  await activeWorkshop.save();

  return activeWorkshop;
};

exports.updateService = async (userId, serviceId, updateData) => {
  const staffLinks = await WorkshopStaff.find({ user_id: userId, is_owner: true });
  
  let activeWorkshop = null;
  for (const staffLink of staffLinks) {
    const workshop = await Workshop.findById(staffLink.workshop_id);
    if (workshop && ['Active', 'Pending_Approval', 'Suspended'].includes(workshop.status)) {
      activeWorkshop = workshop;
      break;
    }
  }

  if (!activeWorkshop) {
    const error = new Error('You do not have a valid, active workshop to update.');
    error.status = 404;
    throw error;
  }

  const service = activeWorkshop.services.find(s => (s.id && s.id === serviceId) || (s._id && s._id.toString() === serviceId));
  if (!service) {
    const error = new Error('Service not found.');
    error.status = 404;
    throw error;
  }

  if (updateData.name !== undefined) {
    const cleanName = updateData.name.replace(/\s+/g, ' ').trim();
    if (!cleanName) {
      const error = new Error('Service name is required.');
      error.status = 400;
      throw error;
    }
    service.service_name = cleanName;
  }

  if (updateData.price !== undefined) {
    const rawPriceStr = updateData.price.toString().replace(/\D/g, '');
    if (!rawPriceStr || isNaN(parseFloat(rawPriceStr)) || parseFloat(rawPriceStr) < 1000) {
      const error = new Error('Valid service price is required and must be at least 1,000 VND.');
      error.status = 400;
      throw error;
    }
    service.base_price = parseFloat(rawPriceStr);
  }

  if (updateData.desc !== undefined) {
    service.desc = updateData.desc.replace(/\s+/g, ' ').trim();
  }

  if (updateData.category !== undefined) service.category = updateData.category;
  if (updateData.unit !== undefined) service.unit = updateData.unit;
  if (updateData.active !== undefined) service.active = updateData.active;

  await activeWorkshop.save();
  return activeWorkshop;
};

exports.deleteService = async (userId, serviceId) => {
  const staffLinks = await WorkshopStaff.find({ user_id: userId, is_owner: true });
  
  let activeWorkshop = null;
  for (const staffLink of staffLinks) {
    const workshop = await Workshop.findById(staffLink.workshop_id);
    if (workshop && ['Active', 'Pending_Approval', 'Suspended'].includes(workshop.status)) {
      activeWorkshop = workshop;
      break;
    }
  }

  if (!activeWorkshop) {
    const error = new Error('You do not have a valid, active workshop.');
    error.status = 404;
    throw error;
  }

  // Handle finding the service correctly using our logic (supporting both id and _id)
  const service = activeWorkshop.services.find(s => (s.id && s.id === serviceId) || (s._id && s._id.toString() === serviceId));
  if (!service) {
    const error = new Error('Service not found.');
    error.status = 404;
    throw error;
  }

  activeWorkshop.services.pull({ _id: service._id });
  await activeWorkshop.save();
  return activeWorkshop;
};

exports.updateCoverPhoto = async (userId, fileBuffer) => {
  const staffLinks = await WorkshopStaff.find({ user_id: userId, is_owner: true });
  
  let activeWorkshop = null;
  for (const staffLink of staffLinks) {
    const workshop = await Workshop.findById(staffLink.workshop_id);
    if (workshop && ['Active', 'Pending_Approval', 'Suspended'].includes(workshop.status)) {
      activeWorkshop = workshop;
      break;
    }
  }

  if (!activeWorkshop) {
    const error = new Error('Could not find your workshop information.');
    error.status = 404;
    throw error;
  }

  if (activeWorkshop.cover_photo && activeWorkshop.cover_photo.includes('cloudinary.com')) {
    try {
      const regex = /\/upload\/(?:v\d+\/)?([^\.]+)/;
      const match = activeWorkshop.cover_photo.match(regex);
      if (match && match[1]) {
        await deleteImage(match[1]);
      }
    } catch (deleteErr) {
      console.error('Failed to delete old cover photo:', deleteErr);
    }
  }

  const folder = `smart-flood-traffic/workshops/${activeWorkshop._id}`;
  const publicId = `cover-${activeWorkshop._id}-${Date.now()}`;
  const result = await uploadImage(fileBuffer, folder, publicId);

  activeWorkshop.cover_photo = result.secure_url;
  await activeWorkshop.save();


  return result.secure_url;
};

exports.getWorkshopById = async (id) => {
  const workshop = await Workshop.findOne({ _id: id, status: 'Active' }).lean();
  if (!workshop) {
    const error = new Error('Workshop not found.');
    error.status = 404;
    throw error;
  }

  // Lookup owner via WorkshopStaff join
  const ownerLink = await WorkshopStaff.findOne({ workshop_id: id, is_owner: true }).lean();
  let owner_id = null;
  let owner_name = '';
  if (ownerLink) {
    const owner = await User.findById(ownerLink.user_id).select('full_name').lean();
    owner_id = ownerLink.user_id;
    owner_name = owner ? owner.full_name : '';
  }

  return {
    ...workshop,
    id: workshop._id,
    status: checkCurrentlyOpen(workshop) ? 'open' : 'closed',
    rating: workshop.rating_average || 0,
    reviewCount: workshop.rating_count || 0,
    owner_id,
    owner_name,
  };
};

function getDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 9999999;
  const R = 6371e3; // Earth radius in meters
  const d1 = lat1 * Math.PI / 180;
  const d2 = lat2 * Math.PI / 180;
  const dy = (lat2 - lat1) * Math.PI / 180;
  const dx = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(dy / 2) * Math.sin(dy / 2) +
            Math.cos(d1) * Math.cos(d2) *
            Math.sin(dx / 2) * Math.sin(dx / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

exports.getMobileWorkshopsInRadius = async (lat, lng) => {
  const userLat = parseFloat(lat);
  const userLng = parseFloat(lng);
  
  if (isNaN(userLat) || isNaN(userLng)) {
    const error = new Error('Valid lat and lng query coordinates are required.');
    error.status = 400;
    throw error;
  }

  const workshops = await Workshop.find({
    status: 'Active',
    is_mobile: true
  }).lean();

  const activeMobileWorkshops = [];
  for (const w of workshops) {
    const isOpen = checkCurrentlyOpen(w);
    if (!isOpen) continue;

    const distanceMeters = getDistance(userLat, userLng, w.lat, w.lng);
    const radiusMeters = (w.coverage_radius || 5) * 1000;
    
    if (distanceMeters <= radiusMeters) {
      const ownerLink = await WorkshopStaff.findOne({ workshop_id: w._id, is_owner: true }).lean();
      let owner_name = '';
      let owner_id = null;
      if (ownerLink) {
        const owner = await User.findById(ownerLink.user_id).select('full_name').lean();
        owner_id = ownerLink.user_id;
        owner_name = owner ? owner.full_name : '';
      }

      activeMobileWorkshops.push({
        ...w,
        id: w._id,
        is_open: true,
        owner_id,
        owner_name,
        distanceToUser: distanceMeters / 1000
      });
    }
  }

  activeMobileWorkshops.sort((a, b) => a.distanceToUser - b.distanceToUser);
  return activeMobileWorkshops;
};
