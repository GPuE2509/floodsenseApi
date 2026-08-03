const WarningZone = require('../../models/WarningZone');

exports.getWarningZones = async (userId) => {
  return await WarningZone.find({ user_id: userId }).exec();
};

exports.createWarningZone = async (userId, zoneData) => {
  const { zone_name, lat, lng, radius_meters, is_active, address, level } = zoneData;

  if (lat === undefined || lng === undefined) {
    const error = new Error('Latitude and longitude are required.');
    error.status = 400;
    throw error;
  }

  const newZone = new WarningZone({
    user_id: userId,
    zone_name: zone_name || 'Warning Zone',
    location: {
      type: 'Point',
      coordinates: [Number(lng), Number(lat)]
    },
    radius_meters: Number(radius_meters || 2000),
    address: address,
    level: level || 'medium',
    is_active: is_active !== undefined ? is_active : true
  });

  await newZone.save();
  return newZone;
};

exports.updateWarningZone = async (userId, zoneId, zoneData) => {
  const { zone_name, lat, lng, radius_meters, is_active, address, level } = zoneData;

  const zone = await WarningZone.findOne({ _id: zoneId, user_id: userId });
  if (!zone) {
    const error = new Error('Warning zone not found or unauthorized.');
    error.status = 404;
    throw error;
  }

  if (zone_name !== undefined) zone.zone_name = zone_name;
  if (radius_meters !== undefined) zone.radius_meters = Number(radius_meters);
  if (is_active !== undefined) zone.is_active = is_active;
  if (address !== undefined) zone.address = address;
  if (level !== undefined) zone.level = level;
  if (lat !== undefined && lng !== undefined) {
    zone.location = {
      type: 'Point',
      coordinates: [Number(lng), Number(lat)]
    };
  }

  await zone.save();
  return zone;
};

exports.deleteWarningZone = async (userId, zoneId) => {
  const zone = await WarningZone.findOneAndDelete({ _id: zoneId, user_id: userId });
  if (!zone) {
    const error = new Error('Warning zone not found or unauthorized.');
    error.status = 404;
    throw error;
  }
  return zone;
};
