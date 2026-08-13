// src/services/user/warningRoadService.js
const WarningRoad = require('../../models/WarningRoad');
const Notification = require('../../models/Notification');
const wsHelper = require('../../utils/wsHelper');

exports.getWarningRoads = async (userId) => {
  return await WarningRoad.find({ user_id: userId }).exec();
};

exports.createWarningRoad = async (userId, roadData) => {
  const { road_name, coordinates, is_active } = roadData;

  if (!coordinates || !Array.isArray(coordinates) || coordinates.length < 2) {
    const error = new Error('Coordinates must be an array of at least 2 points.');
    error.status = 400;
    throw error;
  }

  const numericCoords = coordinates.map(pt => {
    if (!Array.isArray(pt) || pt.length < 2) {
      const error = new Error('Each coordinate point must be [longitude, latitude].');
      error.status = 400;
      throw error;
    }
    return [Number(pt[0]), Number(pt[1])];
  });

  const newRoad = new WarningRoad({
    user_id: userId,
    road_name: road_name || 'Warning Road',
    polyline: {
      type: 'LineString',
      coordinates: numericCoords
    },
    is_active: is_active !== undefined ? is_active : true
  });

  await newRoad.save();
  return newRoad;
};

exports.updateWarningRoad = async (userId, roadId, roadData) => {
  const { road_name, coordinates, is_active } = roadData;

  const road = await WarningRoad.findOne({ _id: roadId, user_id: userId });
  if (!road) {
    const error = new Error('Warning road not found or unauthorized.');
    error.status = 404;
    throw error;
  }

  if (road_name !== undefined) road.road_name = road_name;
  if (is_active !== undefined) road.is_active = is_active;
  if (coordinates !== undefined) {
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      const error = new Error('Coordinates must be an array of at least 2 points.');
      error.status = 400;
      throw error;
    }
    road.polyline = {
      type: 'LineString',
      coordinates: coordinates.map(pt => [Number(pt[0]), Number(pt[1])])
    };
  }

  await road.save();
  return road;
};

exports.deleteWarningRoad = async (userId, roadId) => {
  const road = await WarningRoad.findOneAndDelete({ _id: roadId, user_id: userId });
  if (!road) {
    const error = new Error('Warning road not found or unauthorized.');
    error.status = 404;
    throw error;
  }
  return road;
};

exports.checkAndNotifyWarningRoads = async (lat, lng, eventSource, eventDetail) => {
  try {
    const matchingRoads = await WarningRoad.find({
      polyline: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [Number(lng), Number(lat)]
          },
          $maxDistance: 200 // 200 meters
        }
      },
      is_active: true
    }).exec();

    if (matchingRoads.length === 0) return;

    for (const road of matchingRoads) {
      const title = `🚨 Road Warning: ${road.road_name}`;
      const body = `Incident detected near your tracked road: ${eventDetail} (${eventSource}).`;

      const notif = await Notification.create({
        recipient_id: road.user_id,
        recipient_role: 'User',
        title,
        body,
        type: 'System_Alert',
        metadata: {
          sender_name: 'Warning System',
          web_url: '/sos',
          lat,
          lng,
          road_name: road.road_name
        }
      });

      wsHelper.sendToUser(road.user_id, {
        type: 'notification',
        notification: notif
      });
    }
  } catch (error) {
    console.error('Error in checkAndNotifyWarningRoads:', error);
  }
};
