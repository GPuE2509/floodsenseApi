const WarningZone = require('../models/WarningZone');
const Notification = require('../models/Notification');

function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

exports.checkAndTriggerWarningZoneAlerts = async (eventLat, eventLng, eventDetails) => {
  try {
    const activeZones = await WarningZone.find({ is_active: true }).exec();

    for (const zone of activeZones) {
      if (zone.location && zone.location.coordinates) {
        const [zoneLng, zoneLat] = zone.location.coordinates;
        const distance = getDistanceMeters(eventLat, eventLng, zoneLat, zoneLng);

        if (distance <= (zone.radius_meters || 2000)) {
          const User = require('../models/User');
          const owner = await User.findById(zone.user_id).exec();
          if (owner && owner.notification_preferences) {
            const prefs = owner.notification_preferences;
            if (prefs.masterPush === false || prefs.flood === false) {
              continue;
            }
          }
          const notification = new Notification({
            recipient_id: zone.user_id,
            title: eventDetails.title,
            body: eventDetails.body || `Phát hiện ngập lụt trong vùng cảnh báo "${zone.zone_name}" của bạn.`,
            type: eventDetails.type || 'Flood_In_Warning_Zone',
            reference_id: eventDetails.reference_id,
            reference_type: eventDetails.reference_type,
            metadata: {
              ...eventDetails.metadata,
              web_url: eventDetails.metadata?.web_url || '/dashboard'
            }
          });

          await notification.save();
        }
      }
    }
  } catch (error) {
    console.error('Error in checkAndTriggerWarningZoneAlerts:', error);
  }
};
