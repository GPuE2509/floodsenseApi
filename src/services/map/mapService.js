/**
 * Map Service
 * Handles Goong Maps API queries for geocoding, search, and routing.
 */

const Workshop = require('../../models/Workshop');
const WorkshopStaff = require('../../models/WorkshopStaff');
const User = require('../../models/User');
const IotDevice = require('../../models/IotDevice');
const IncidentReport = require('../../models/IncidentReport');

// Polyline decoding helper for Goong Overview Polyline (Google Polyline format)
function decodePolyline(str) {
  let index = 0,
      lat = 0,
      lng = 0,
      coordinates = [],
      shift = 0,
      result = 0,
      byte = null,
      latitude_change,
      longitude_change;

  while (index < str.length) {
    byte = null;
    shift = 0;
    result = 0;

    do {
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    latitude_change = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += latitude_change;

    shift = 0;
    result = 0;

    do {
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    longitude_change = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lng += longitude_change;

    // Goong returns coordinates in [lng, lat] for GeoJSON
    coordinates.push([lng / 100000, lat / 100000]);
  }

  return coordinates;
}

// Maps Goong address_components list into Nominatim-like address structure
function mapGoongAddressToNominatim(components, formattedAddress) {
  const address = {
    road: '',
    house_number: '',
    ward: '',
    district: '',
    city: ''
  };

  if (!components || components.length === 0) {
    const parts = formattedAddress ? formattedAddress.split(',').map(p => p.trim()) : [];
    if (parts.length >= 1) address.city = parts[parts.length - 1];
    if (parts.length >= 2) address.district = parts[parts.length - 2];
    if (parts.length >= 3) address.ward = parts[parts.length - 3];
    if (parts.length >= 4) address.road = parts.slice(0, parts.length - 3).join(', ');
    return address;
  }

  const len = components.length;
  if (len >= 1) {
    address.city = components[len - 1].long_name;
  }
  if (len >= 2) {
    address.district = components[len - 2].long_name;
  }
  if (len >= 3) {
    address.ward = components[len - 3].long_name;
  }
  
  const streetParts = [];
  for (let i = 0; i < len - 3; i++) {
    const comp = components[i];
    if (/\d/.test(comp.long_name) && !address.house_number) {
      address.house_number = comp.long_name;
    } else {
      streetParts.push(comp.long_name);
    }
  }
  address.road = streetParts.join(', ');

  return address;
}

exports.searchNominatim = async (query, lat, lng) => {
  if (!query || !query.trim()) {
    return [];
  }

  const apiKey = process.env.GOONG_API_KEY;

  try {
    // 1. Try Goong Place Autocomplete API to fetch multiple suggestions
    let autocompleteUrl = `https://rsapi.goong.io/Place/Autocomplete?input=${encodeURIComponent(query.trim())}&api_key=${apiKey}`;
    if (lat && lng) {
      autocompleteUrl += `&location=${lat},${lng}&radius=50000`;
    }

    const autocompleteResponse = await fetch(autocompleteUrl, { method: 'GET' });
    if (autocompleteResponse.ok) {
      const autocompleteData = await autocompleteResponse.json();
      
      if (autocompleteData.predictions && autocompleteData.predictions.length > 0) {
        // Fetch up to 10 suggestions to resolve details (coordinates)
        const topPredictions = autocompleteData.predictions.slice(0, 10);
        
        const detailedResults = await Promise.all(
          topPredictions.map(async (pred) => {
            try {
              const detailUrl = `https://rsapi.goong.io/v2/place/detail?place_id=${pred.place_id}&api_key=${apiKey}`;
              const detailRes = await fetch(detailUrl, { method: 'GET' });
              if (!detailRes.ok) return null;
              
              const detailData = await detailRes.json();
              if (detailData.result) {
                const item = detailData.result;
                return {
                  place_id: item.place_id,
                  display_name: item.formatted_address,
                  lat: item.geometry && item.geometry.location ? String(item.geometry.location.lat) : '0',
                  lon: item.geometry && item.geometry.location ? String(item.geometry.location.lng) : '0',
                  address: mapGoongAddressToNominatim(item.address_components, item.formatted_address),
                  boundingbox: []
                };
              }
            } catch (err) {
              console.warn(`Error fetching place detail for ${pred.place_id}:`, err);
            }
            return null;
          })
        );

        const filteredResults = detailedResults.filter(Boolean);
        if (filteredResults.length > 0) {
          if (lat && lng) {
            const latNum = parseFloat(lat);
            const lngNum = parseFloat(lng);
            filteredResults.sort((a, b) => {
              const distA = getDistance(latNum, lngNum, parseFloat(a.lat), parseFloat(a.lon));
              const distB = getDistance(latNum, lngNum, parseFloat(b.lat), parseFloat(b.lon));
              return distA - distB;
            });
          }
          return filteredResults;
        }
      }
    }
  } catch (error) {
    console.warn('Autocomplete search failed, falling back to Geocode:', error);
  }

  // 2. Fallback to existing Geocode API if Autocomplete returns no predictions or fails
  let geocodeUrl = `https://rsapi.goong.io/Geocode?address=${encodeURIComponent(query.trim())}&api_key=${apiKey}`;

  try {
    const response = await fetch(geocodeUrl, { method: 'GET' });

    if (!response.ok) {
      throw new Error(`Goong Geocode API returned status: ${response.status}`);
    }

    const data = await response.json();
    if (!data.results) {
      return [];
    }

    const mapped = data.results.map(item => ({
      place_id: item.place_id,
      display_name: item.formatted_address,
      lat: item.geometry && item.geometry.location ? String(item.geometry.location.lat) : '0',
      lon: item.geometry && item.geometry.location ? String(item.geometry.location.lng) : '0',
      address: mapGoongAddressToNominatim(item.address_components, item.formatted_address),
      boundingbox: []
    }));

    if (lat && lng) {
      const latNum = parseFloat(lat);
      const lngNum = parseFloat(lng);
      mapped.sort((a, b) => {
        const distA = getDistance(latNum, lngNum, parseFloat(a.lat), parseFloat(a.lon));
        const distB = getDistance(latNum, lngNum, parseFloat(b.lat), parseFloat(b.lon));
        return distA - distB;
      });
    }

    return mapped;
  } catch (error) {
    console.error('Error fetching from Goong Geocode API:', error);
    throw new Error('Failed to retrieve location details from map search service.');
  }
};

exports.reverseGeocode = async (lat, lng) => {
  if (!lat || !lng) {
    throw new Error('Latitude and longitude parameters are required.');
  }

  const apiKey = process.env.GOONG_API_KEY;
  const url = `https://rsapi.goong.io/Geocode?latlng=${lat},${lng}&api_key=${apiKey}`;

  try {
    const response = await fetch(url, { method: 'GET' });

    if (!response.ok) {
      throw new Error(`Goong Reverse Geocode API returned status: ${response.status}`);
    }

    const data = await response.json();
    if (!data.results || data.results.length === 0) {
      return { address: {} };
    }

    const item = data.results[0];
    return {
      place_id: item.place_id,
      display_name: item.formatted_address,
      lat: String(lat),
      lon: String(lng),
      address: mapGoongAddressToNominatim(item.address_components, item.formatted_address)
    };
  } catch (error) {
    console.error('Error fetching from Goong Reverse Geocode API:', error);
    throw new Error('Failed to retrieve reverse geocoding details.');
  }
};

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

exports.getActiveWorkshops = async () => {
  try {
    const workshops = await Workshop.find(
      { status: 'Active' },
      'name phone address lat lng is_mobile coverage_radius services rating_average rating_count is_open cover_photo weekly_calendar open_time close_time'
    ).lean();

    // Populate owner names
    const workshopIds = workshops.map(w => w._id);
    const staffLinks = await WorkshopStaff.find({ workshop_id: { $in: workshopIds }, is_owner: true }).lean();
    const userIds = staffLinks.map(s => s.user_id);
    const users = await User.find({ _id: { $in: userIds } }, 'full_name').lean();

    const userMap = users.reduce((acc, u) => {
      acc[u._id.toString()] = u.full_name;
      return acc;
    }, {});

    const ownerMap = staffLinks.reduce((acc, s) => {
      acc[s.workshop_id.toString()] = userMap[s.user_id.toString()] || '';
      return acc;
    }, {});

    const ownerIdMap = staffLinks.reduce((acc, s) => {
      acc[s.workshop_id.toString()] = s.user_id.toString();
      return acc;
    }, {});

    return workshops.map(w => ({
      ...w,
      is_open: checkCurrentlyOpen(w),
      owner_name: ownerMap[w._id.toString()] || '',
      owner_id: ownerIdMap[w._id.toString()] || ''
    }));
  } catch (error) {
    console.error('Error in mapService.getActiveWorkshops:', error);
    throw new Error('Database error while fetching active workshops.');
  }
};

// Haversine distance formula (in meters)
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const deltaPhi = (lat2 - lat1) * Math.PI / 180;
  const deltaLambda = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// Calculate alternative routes and assess flooding & hazards along them.
// We query Goong twice (car + bike) so we always have at least 2 alternatives
// even for short distances where Goong returns only 1 car route.// Helper to perturb route coordinates at any ratio along the path perpendicularly
const getPerturbedWaypoint = (lat1, lng1, lat2, lng2, ratio, factor) => {
  const ptLat = lat1 + (lat2 - lat1) * ratio;
  const ptLng = lng1 + (lng2 - lng1) * ratio;
  
  const dLat = lat2 - lat1;
  const dLng = lng2 - lng1;
  
  return {
    lat: ptLat - factor * dLng,
    lng: ptLng + factor * dLat
  };
};

exports.calculateAlternativeRoutes = async (startLat, startLng, endLat, endLng, waypoints = '') => {
  const apiKey = process.env.GOONG_API_KEY;
  const hasWaypoints = waypoints && waypoints.trim();
  
  let allRoutes = [];

  if (hasWaypoints) {
    // Direct Trip API execution if custom waypoints are already requested
    const tripUrl = `https://rsapi.goong.io/v2/trip?origin=${startLat},${startLng}&destination=${endLat},${endLng}&waypoints=${waypoints.trim()}&vehicle=motorbike&api_key=${apiKey}`;
    try {
      const res = await fetch(tripUrl);
      if (res.ok) {
        const json = await res.json();
        if (json.trips && json.trips.length > 0) {
          allRoutes.push(...json.trips.map(t => ({
            ...t,
            overview_polyline: t.geometry?.overview_polyline || t.overview_polyline
          })));
        }
      }
    } catch (_) {}
  } else {
    // Generate 4 perturbed waypoints along different stages of the route
    const pt1 = getPerturbedWaypoint(Number(startLat), Number(startLng), Number(endLat), Number(endLng), 0.35, 0.45);  // 35% along path, shifted left
    const pt2 = getPerturbedWaypoint(Number(startLat), Number(startLng), Number(endLat), Number(endLng), 0.65, -0.45); // 65% along path, shifted right
    const pt3 = getPerturbedWaypoint(Number(startLat), Number(startLng), Number(endLat), Number(endLng), 0.50, 0.65);  // Midpoint, shifted left further
    const pt4 = getPerturbedWaypoint(Number(startLat), Number(startLng), Number(endLat), Number(endLng), 0.50, -0.65); // Midpoint, shifted right further

    const directUrl = `https://rsapi.goong.io/Direction?origin=${startLat},${startLng}&destination=${endLat},${endLng}&vehicle=bike&api_key=${apiKey}&alternatives=true`;
    const perturbedUrl1 = `https://rsapi.goong.io/v2/trip?origin=${startLat},${startLng}&destination=${endLat},${endLng}&waypoints=${pt1.lat.toFixed(6)},${pt1.lng.toFixed(6)}&vehicle=motorbike&api_key=${apiKey}`;
    const perturbedUrl2 = `https://rsapi.goong.io/v2/trip?origin=${startLat},${startLng}&destination=${endLat},${endLng}&waypoints=${pt2.lat.toFixed(6)},${pt2.lng.toFixed(6)}&vehicle=motorbike&api_key=${apiKey}`;
    const perturbedUrl3 = `https://rsapi.goong.io/v2/trip?origin=${startLat},${startLng}&destination=${endLat},${endLng}&waypoints=${pt3.lat.toFixed(6)},${pt3.lng.toFixed(6)}&vehicle=motorbike&api_key=${apiKey}`;
    const perturbedUrl4 = `https://rsapi.goong.io/v2/trip?origin=${startLat},${startLng}&destination=${endLat},${endLng}&waypoints=${pt4.lat.toFixed(6)},${pt4.lng.toFixed(6)}&vehicle=motorbike&api_key=${apiKey}`;
    const carDirectUrl = `https://rsapi.goong.io/Direction?origin=${startLat},${startLng}&destination=${endLat},${endLng}&vehicle=car&api_key=${apiKey}&alternatives=true`;



    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const fetchPromises = [
      fetch(directUrl, { signal: controller.signal }).then(async r => r.ok ? r.json() : null).catch(() => null),
      fetch(perturbedUrl1, { signal: controller.signal }).then(async r => r.ok ? r.json() : null).catch(() => null),
      fetch(perturbedUrl2, { signal: controller.signal }).then(async r => r.ok ? r.json() : null).catch(() => null),
      fetch(perturbedUrl3, { signal: controller.signal }).then(async r => r.ok ? r.json() : null).catch(() => null),
      fetch(perturbedUrl4, { signal: controller.signal }).then(async r => r.ok ? r.json() : null).catch(() => null),
      fetch(carDirectUrl, { signal: controller.signal }).then(async r => r.ok ? r.json() : null).catch(() => null),
    ];

    const results = await Promise.all(fetchPromises);
    clearTimeout(timeoutId);

    
    // Process Direct bike routes
    if (results[0] && results[0].routes) {
      allRoutes.push(...results[0].routes);
    }

    // Process Perturbed route 1
    if (results[1] && results[1].trips) {
      allRoutes.push(...results[1].trips.map(t => ({
        ...t,
        overview_polyline: t.geometry?.overview_polyline || t.overview_polyline
      })));
    }

    // Process Perturbed route 2
    if (results[2] && results[2].trips) {
      allRoutes.push(...results[2].trips.map(t => ({
        ...t,
        overview_polyline: t.geometry?.overview_polyline || t.overview_polyline
      })));
    }

    // Process Perturbed route 3
    if (results[3] && results[3].trips) {
      allRoutes.push(...results[3].trips.map(t => ({
        ...t,
        overview_polyline: t.geometry?.overview_polyline || t.overview_polyline
      })));
    }

    // Process Perturbed route 4
    if (results[4] && results[4].trips) {
      allRoutes.push(...results[4].trips.map(t => ({
        ...t,
        overview_polyline: t.geometry?.overview_polyline || t.overview_polyline
      })));
    }

    // Process Car direct routes
    if (results[5] && results[5].routes) {
      allRoutes.push(...results[5].routes);
    }
  }



  // Deduplicate routes by comparing entire polyline geometries and distances
  const uniqueRoutes = [];
  for (const r of allRoutes) {
    const polyPoints = r.overview_polyline?.points || '';
    if (!polyPoints) continue;

    const rDist = r.distance !== undefined ? r.distance : (r.legs?.[0]?.distance?.value || 0);
    
    const isDuplicate = uniqueRoutes.some(existing => {
      const existingPoints = existing.overview_polyline?.points || '';
      const existingDist = existing.distance !== undefined ? existing.distance : (existing.legs?.[0]?.distance?.value || 0);
      const distanceDifference = Math.abs(rDist - existingDist);
      // Only duplicate if exact same polyline or within 5 meters of distance and very similar prefix
      return polyPoints === existingPoints || (distanceDifference < 5 && polyPoints.substring(0, 150) === existingPoints.substring(0, 150));
    });

    if (!isDuplicate) {
      uniqueRoutes.push({ ...r, _vehicle: 'bike' });
    }
  }



  if (uniqueRoutes.length === 0) {
    try {
      const osrmUrl = `http://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=polyline&alternatives=true`;
      const controller = new AbortController();
      const osrmTimeout = setTimeout(() => controller.abort(), 5000);
      const osrmRes = await fetch(osrmUrl, { signal: controller.signal });
      clearTimeout(osrmTimeout);
      if (osrmRes.ok) {
        const osrmJson = await osrmRes.json();
        if (osrmJson.routes && osrmJson.routes.length > 0) {
          uniqueRoutes.push(...osrmJson.routes.map((r) => ({
            distance: r.distance,
            duration: r.duration,
            overview_polyline: { points: r.geometry },
            _vehicle: 'bike'
          })));
        }
      }
    } catch (e) {
      console.error('OSRM fallback failed:', e);
    }
    if (uniqueRoutes.length === 0) {
      return []; // Return empty array if all routing engines fail, so UI shows 'No routes available' gracefully
    }
  }

  let routes = uniqueRoutes;




  // Fetch active flooded IoT sensors
  const floodedSensors = await IotDevice.find({
    is_disabled: false,
    status: 'Online',
    warning_water_status: { $ne: 'safe' }
  }).lean();

  // Fetch active hazard points
  const activeHazards = await IncidentReport.find({
    moderation_status: 'Approved'
  }).lean();

  // Filter hazards where confirm votes >= deny votes
  const hazardsStillExist = activeHazards.filter(h => {
    const confirm = h.vote_still_exist || 0;
    const deny = h.vote_no_more || 0;
    return confirm >= deny;
  });

  const floodThreshold = 150; // meters
  const hazardThreshold = 100; // meters
  const hazardPenaltySeconds = 600; // 10 minutes weight penalty per hazard point

  const evaluatedRoutes = routes.map((route, index) => {
    let coordinates = [];
    if (route.geometry && Array.isArray(route.geometry.coordinates)) {
      coordinates = route.geometry.coordinates;
    } else {
      const polylinePoints = route.overview_polyline ? route.overview_polyline.points : '';
      coordinates = polylinePoints ? decodePolyline(polylinePoints) : [];
    }

    const geometry = {
      type: 'LineString',
      coordinates: coordinates
    };

    const encounteredFloods = [];
    const encounteredHazards = [];

    // Check intersection with flooded sensors
    floodedSensors.forEach(sensor => {
      let minDistance = Infinity;
      for (const coord of coordinates) {
        const d = getDistance(coord[1], coord[0], sensor.lat, sensor.lng);
        if (d < minDistance) {
          minDistance = d;
        }
      }
      if (minDistance <= floodThreshold) {
        encounteredFloods.push({
          device_code: sensor.device_code,
          name: sensor.name,
          location: sensor.location,
          water_percent: sensor.water_percent,
          warning_water_status: sensor.warning_water_status,
          current_water_level: sensor.current_water_level,
          distance: minDistance,
          lat: sensor.lat,
          lng: sensor.lng
        });
      }
    });

    // Check intersection with active hazard points
    hazardsStillExist.forEach(hazard => {
      let minDistance = Infinity;
      for (const coord of coordinates) {
        const d = getDistance(coord[1], coord[0], hazard.lat, hazard.lng);
        if (d < minDistance) {
          minDistance = d;
        }
      }
      if (minDistance <= hazardThreshold) {
        encounteredHazards.push({
          id: hazard._id,
          title: hazard.title || 'Hazard Report',
          description: hazard.description,
          report_type: hazard.report_type,
          vote_still_exist: hazard.vote_still_exist,
          vote_no_more: hazard.vote_no_more,
          distance: minDistance,
          lat: hazard.lat,
          lng: hazard.lng
        });
      }
    });

    const isFlooded = encounteredFloods.length > 0;
    
    let distance = 0;
    let baseDuration = 0;

    if (route.distance !== undefined && typeof route.distance === 'number') {
      distance = route.distance;
    } else if (route.legs && route.legs.length > 0) {
      distance = route.legs.reduce((sum, l) => sum + (l.distance?.value !== undefined ? l.distance.value : (typeof l.distance === 'number' ? l.distance : 0)), 0);
    }

    if (route.duration !== undefined && typeof route.duration === 'number') {
      baseDuration = route.duration;
    } else if (route.legs && route.legs.length > 0) {
      baseDuration = route.legs.reduce((sum, l) => sum + (l.duration?.value !== undefined ? l.duration.value : (typeof l.duration === 'number' ? l.duration : 0)), 0);
    }

    const trafficAdjustmentFactor = 1.0; // Goong already contains real-time traffic speeds
    const duration = Math.round(baseDuration * trafficAdjustmentFactor); // seconds
    
    const hazardCount = encounteredHazards.length;
    const weightedDuration = duration + (hazardCount * hazardPenaltySeconds);

    return {
      index,
      distance,
      duration,
      weighted_duration: weightedDuration,
      is_flooded: isFlooded,
      floods: encounteredFloods,
      hazards: encounteredHazards,
      geometry: geometry
    };
  });

  // Sort routes:
  // 1. Safe routes (is_flooded = false) first, sorted by weighted_duration
  // 2. Flooded routes (is_flooded = true) last, sorted by weighted_duration
  evaluatedRoutes.sort((a, b) => {
    if (a.is_flooded && !b.is_flooded) return 1;
    if (!a.is_flooded && b.is_flooded) return -1;
    return a.weighted_duration - b.weighted_duration;
  });

  return evaluatedRoutes;
};

exports.getFloodZoneHeatmap = async () => {
  const WaterLevelLog = require('../../models/WaterLevelLog');
  const devices = await IotDevice.find({ status: 'Online', is_disabled: { $ne: true } }).lean();

  const zones = [];
  
  for (let i = 0; i < devices.length; i++) {
    const dev = devices[i];
    if (dev.lat && dev.lng) {
      const level = dev.current_water_level || 0;
      const calib = dev.calib_empty_cm || 100;
      const pct = Math.min(100, Math.max(0, (level / calib) * 100));
      
      const logCount = await WaterLevelLog.countDocuments({ device_id: dev._id, water_level_mm: { $gte: 300 } });
      const histCount = Math.max(5, logCount > 0 ? logCount : Math.floor(pct / 8) + 3);
      
      let intensity = Math.min(1.0, parseFloat(((pct / 100) * 0.6 + 0.35).toFixed(2)));
      let severity = 'slight';
      if (pct >= 60 || intensity >= 0.75) severity = 'critical';
      else if (pct >= 50 || intensity >= 0.65) severity = 'severe';
      else if (pct >= 40 || intensity >= 0.5) severity = 'moderate';

      const localizedRadius = Math.min(260, 120 + Math.floor(level * 1.5));

      zones.push({
        id: `heatmap-dev-${dev._id}`,
        name: `Cụm trạm ${dev.name || dev.device_code || 'IoT Zone'}`,
        lat: dev.lat,
        lng: dev.lng,
        radius_m: localizedRadius,
        intensity: intensity,
        severity: severity,
        historical_incidents: histCount,
        realtime_level_cm: level,
        description: `Mật độ ngập tích lũy thời gian thực và lịch sử tại cụm ${dev.location || 'trung tâm'}.`
      });
    }
  }

  return zones;
};

// ── Emergency Facilities via Overpass API (OpenStreetMap) ──────────────────────
// Uses the Overpass API to query real OSM amenity/emergency tags.
// This is far more complete than keyword-based APIs – it returns every hospital,
// clinic, pharmacy, police station, fire station, shelter and rescue post that
// OpenStreetMap contributors have mapped in the area.
//
// Cache: key = "lat3dp_lng3dp_radiusM"  →  stored as a Map<osmId, facility>
// When the radius grows, we re-fetch (larger circle = different query).
// When the radius shrinks, we filter the existing Map instead of fetching again.
const _emergencyCache = {};

function _haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}


// Facility type metadata (icon/color/label) – same as before
const FACILITY_TYPE_MAP = {
  hospital:       { label: 'General Hospital',             color: '#B91C1C', icon: 'hospital' },
  health_center:  { label: 'Health Center',                color: '#C2410C', icon: 'stethoscope' },
  pharmacy:       { label: 'Medical Supply / Pharmacy',    color: '#047857', icon: 'cross' },
  fire_station:   { label: 'Fire & Rescue Command',        color: '#991B1B', icon: 'flame' },
  police:         { label: 'Police / Security Department', color: '#1D4ED8', icon: 'shield' },
  shelter:        { label: 'Evacuation Shelter / Refugee', color: '#4338CA', icon: 'home' },
  rescue_station: { label: 'Emergency Rescue Outpost',     color: '#0F766E', icon: 'life-buoy' },
};

/**
 * Build an Overpass QL query that fetches ALL emergency-relevant nodes AND ways
 * within `radiusM` metres of (lat, lng).
 *
 * OSM amenity tags covered:
 *   hospital, clinic, doctors, health_centre, pharmacy,
 *   fire_station, police, shelter, social_facility
 * OSM emergency tags covered:
 *   ambulance_station, rescue_station, fire_hydrant (excluded),
 *   assembly_point, disaster_response
 */
function _buildOverpassQuery(lat, lng, radiusM) {
  const r = radiusM;
  const center = `${lat},${lng}`;

  // Each union member = one amenity or emergency tag value
  const amenityTags = [
    'hospital',
    'clinic',
    'doctors',
    'health_centre',
    'pharmacy',
    'fire_station',
    'police',
    'shelter',
    'social_facility',
  ];
  const emergencyTags = [
    'ambulance_station',
    'rescue_station',
    'assembly_point',
    'disaster_response',
    'mountain_rescue',
    'water_rescue',
  ];

  const amenityParts = amenityTags
    .map(tag => `  node["amenity"="${tag}"](around:${r},${center});\n  way["amenity"="${tag}"](around:${r},${center});`)
    .join('\n');

  const emergencyParts = emergencyTags
    .map(tag => `  node["emergency"="${tag}"](around:${r},${center});\n  way["emergency"="${tag}"](around:${r},${center});`)
    .join('\n');

  return `[out:json][timeout:25];\n(\n${amenityParts}\n${emergencyParts}\n);\nout center;`;
}

/**
 * Map an OSM element (node or way) to our facility type key.
 */
function _osmToFacilityType(tags) {
  const amenity = tags.amenity || '';
  const emergency = tags.emergency || '';

  if (amenity === 'hospital') return 'hospital';
  if (['clinic', 'doctors', 'health_centre'].includes(amenity)) return 'health_center';
  if (amenity === 'pharmacy') return 'pharmacy';
  if (amenity === 'fire_station') return 'fire_station';
  if (amenity === 'police') return 'police';
  if (['shelter', 'social_facility'].includes(amenity)) return 'shelter';
  if (['ambulance_station', 'rescue_station', 'mountain_rescue', 'water_rescue', 'disaster_response', 'assembly_point'].includes(emergency)) return 'rescue_station';

  return 'rescue_station'; // fallback
}

/**
 * GET /api/map/emergency-facilities?lat=...&lng=...&radius=3000
 *
 * Uses Overpass API to query OpenStreetMap for ALL mapped emergency facilities
 * within the given radius. Results are deduplicated and sorted by distance.
 *
 * Cache strategy:
 *   - Key: "lat3dp_lng3dp_radiusM"  (radius-specific)
 *   - If a LARGER radius result is cached for the same location, we reuse it
 *     by filtering down to the requested radius (no extra API call needed).
 *   - Cache TTL: 20 minutes (OSM data doesn't change that quickly).
 */
const CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutes

// Map Goong place types to our facility types
const GOONG_TYPE_MAP = {
  'hospital':         'hospital',
  'health':           'health_center',
  'pharmacy':         'pharmacy',
  'doctor':           'health_center',
  'dentist':          'health_center',
  'fire_station':     'fire_station',
  'police':           'police',
  'emergency':        'rescue_station',
  'shelter':          'shelter',
  'lodging':          'shelter',
};

// Search keywords for Goong Places API (Vietnamese)
const GOONG_SEARCH_QUERIES = [
  { query: 'bệnh viện',       type: 'hospital' },
  { query: 'phòng khám',      type: 'health_center' },
  { query: 'trạm y tế',       type: 'health_center' },
  { query: 'nhà thuốc',       type: 'pharmacy' },
  { query: 'đồn cảnh sát',    type: 'police' },
  { query: 'công an',         type: 'police' },
  { query: 'phòng cháy chữa cháy', type: 'fire_station' },
  { query: 'cứu hỏa',         type: 'fire_station' },
  { query: 'khu lánh nạn',    type: 'shelter' },
  { query: 'trạm cứu nạn',    type: 'rescue_station' },
];

const OVERPASS_SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];

exports.getEmergencyFacilities = async (lat, lng, radiusM = 3000) => {
  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  const radNum = Math.min(parseInt(radiusM) || 3000, 10000);

  if (isNaN(latNum) || isNaN(lngNum)) {
    throw new Error('Invalid lat/lng coordinates');
  }

  const now = Date.now();
  const locBase = `${latNum.toFixed(3)}_${lngNum.toFixed(3)}`;

  // ── 1. Check master location cache ─────────────────────────────────────────
  // We store a master Map of all discovered facilities around locBase along with maxFetchedRad.
  // If we already fetched a circle >= requested radNum and cache hasn't expired, filter and return!
  let masterCache = _emergencyCache[locBase];
  if (!masterCache || !(masterCache.map instanceof Map)) {
    masterCache = { map: new Map(), maxFetchedRad: 0, expiry: 0 };
    _emergencyCache[locBase] = masterCache;
  }

  if (masterCache.expiry > now && masterCache.maxFetchedRad >= radNum && masterCache.map.size > 0) {
    const facilities = Array.from(masterCache.map.values())
      .filter(f => f.distKm <= radNum / 1000.0)
      .sort((a, b) => a.distKm - b.distKm);
    return { facilities, cached: true };
  }

  const apiKey = process.env.GOONG_API_KEY;
  const fetchRad = Math.max(radNum, masterCache.maxFetchedRad || 0, 5000); // fetch at least 5km to accumulate instantly

  // ── 2. Run Overpass API (with automatic mirrors) & Goong API in parallel ────
  const overpassPromise = (async () => {
    const query = _buildOverpassQuery(latNum, lngNum, fetchRad);
    for (const serverUrl of OVERPASS_SERVERS) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s max per server
        const res = await fetch(serverUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'SmartFloodTrafficRescue/1.0 (contact@smartflood.vn)',
            'Accept': 'application/json'
          },
          body: `data=${encodeURIComponent(query)}`,
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          const json = await res.json();
          if (json && json.elements) {
            return json.elements;
          }
        }
      } catch (err) {
        console.warn(`[Emergency] Overpass mirror ${serverUrl} failed (${err.message}). Trying next mirror...`);
      }
    }
    return [];
  })();

  const goongPromise = (async () => {
    if (!apiKey) return [];
    const goongItems = [];
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    await Promise.allSettled(
      GOONG_SEARCH_QUERIES.map(async ({ query, type }) => {
        try {
          const url = `https://rsapi.goong.io/Place/Autocomplete?input=${encodeURIComponent(query)}&location=${latNum},${lngNum}&radius=${fetchRad}&api_key=${apiKey}`;
          const res = await fetch(url, { method: 'GET', signal: controller.signal });
          if (!res.ok) return;
          const json = await res.json();
          const predictions = json.predictions || [];

          await Promise.allSettled(
            predictions.slice(0, 8).map(async (pred) => {
              try {
                const detailUrl = `https://rsapi.goong.io/v2/place/detail?place_id=${pred.place_id}&api_key=${apiKey}`;
                const detailRes = await fetch(detailUrl, { method: 'GET', signal: controller.signal });
                if (!detailRes.ok) return;
                const detailJson = await detailRes.json();
                const item = detailJson.result;
                if (!item || !item.geometry || !item.geometry.location) return;

                const placeLat = item.geometry.location.lat;
                const placeLng = item.geometry.location.lng;
                const distKm = _haversineKm(latNum, lngNum, placeLat, placeLng);
                if (distKm > 15) return;

                const goongTypes = item.types || [];
                let resolvedType = type;
                for (const t of goongTypes) {
                  if (GOONG_TYPE_MAP[t]) { resolvedType = GOONG_TYPE_MAP[t]; break; }
                }
                const meta = FACILITY_TYPE_MAP[resolvedType] || FACILITY_TYPE_MAP.rescue_station;

                goongItems.push({
                  id: `goong_${item.place_id || pred.place_id}`,
                  name: item.name || item.formatted_address || meta.label,
                  type: resolvedType,
                  label: meta.label,
                  color: meta.color,
                  icon: meta.icon,
                  lat: placeLat,
                  lng: placeLng,
                  address: item.formatted_address || '',
                  phone: item.international_phone_number || item.formatted_phone_number || '',
                  distKm: parseFloat(distKm.toFixed(2)),
                  distStr: distKm < 1 ? `${Math.round(distKm * 1000)} m` : `${distKm.toFixed(1)} km`,
                  openingHours: '',
                });
              } catch (_) {}
            })
          );
    } catch (_) {}
      })
    );
    clearTimeout(timeoutId);
    return goongItems;
  })();

  const timeoutPromise = new Promise(resolve => setTimeout(() => {
    console.warn('[Emergency] APIs timed out overall after 8s');
    resolve([[], []]);
  }, 8000));

  const [elements, goongResults] = await Promise.race([
    Promise.all([overpassPromise, goongPromise]),
    timeoutPromise
  ]);

  // ── 3. Parse and accumulate into masterCache.map ────────────────────────────
  for (const el of elements) {
    const tags = el.tags || {};
    if (!tags.amenity && !tags.emergency) continue;

    const placeLat = el.lat ?? el.center?.lat;
    const placeLng = el.lon ?? el.center?.lon;
    if (placeLat == null || placeLng == null) continue;

    const distKm = _haversineKm(latNum, lngNum, placeLat, placeLng);
    if (distKm > 15) continue;

    const osmId = `${el.type}_${el.id}`;
    if (masterCache.map.has(osmId)) continue;

    const facilityType = _osmToFacilityType(tags);
    const meta = FACILITY_TYPE_MAP[facilityType] || FACILITY_TYPE_MAP.rescue_station;

    const name = tags.name || tags['name:vi'] || tags['name:en'] || meta.label;
    const addrParts = [
      tags['addr:housenumber'],
      tags['addr:street'],
      tags['addr:ward'],
      tags['addr:district'],
      tags['addr:city'],
    ].filter(Boolean);
    const address = addrParts.length > 0 ? addrParts.join(', ') : (tags['addr:full'] || '');
    const phone = tags.phone || tags['contact:phone'] || tags['phone:vi'] || '';

    masterCache.map.set(osmId, {
      id: osmId,
      name,
      type: facilityType,
      label: meta.label,
      color: meta.color,
      icon: meta.icon,
      lat: placeLat,
      lng: placeLng,
      address,
      phone,
      distKm: parseFloat(distKm.toFixed(2)),
      distStr: distKm < 1 ? `${Math.round(distKm * 1000)} m` : `${distKm.toFixed(1)} km`,
      openingHours: tags.opening_hours || '',
    });
  }

  // Merge Goong items avoiding duplicates (within ~60 meters of existing OSM item)
  for (const gItem of goongResults) {
    if (masterCache.map.has(gItem.id)) continue;
    let isDuplicate = false;
    for (const existing of masterCache.map.values()) {
      if (_haversineKm(gItem.lat, gItem.lng, existing.lat, existing.lng) < 0.06) {
        isDuplicate = true;
        break;
      }
    }
    if (!isDuplicate) {
      masterCache.map.set(gItem.id, gItem);
    }
  }

  // If we found any results (or successfully queried), update cache expiry and maxFetchedRad
  if (masterCache.map.size > 0 || (elements.length > 0 || goongResults.length > 0)) {
    masterCache.expiry = now + CACHE_TTL_MS;
    masterCache.maxFetchedRad = Math.max(masterCache.maxFetchedRad, fetchRad);
  }

  const facilities = Array.from(masterCache.map.values())
    .filter(f => f.distKm <= radNum / 1000.0)
    .sort((a, b) => a.distKm - b.distKm);

  return { facilities, cached: false };
};

