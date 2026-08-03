const mapService = require('../../services/map/mapService');

/**
 * GET /api/map/search
 * Proxies OpenStreetMap Nominatim search query
 */
exports.searchArea = async (req, res) => {
  try {
    const { q, lat, lng } = req.query;

    if (!q || !q.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Search query parameter "q" is required.'
      });
    }

    const results = await mapService.searchNominatim(q, lat, lng);

    return res.status(200).json({
      success: true,
      data: results
    });
  } catch (error) {
    console.error('Error in searchArea controller:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error during map area search.'
    });
  }
};

// Get all active workshops for map
exports.getActiveWorkshops = async (req, res) => {
  try {
    const workshops = await mapService.getActiveWorkshops();

    return res.status(200).json({
      success: true,
      data: workshops
    });
  } catch (error) {
    console.error('Error fetching active workshops for map:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch workshops'
    });
  }
};

// Calculate routing options with flood/hazard avoidance
exports.getRoute = async (req, res) => {
  try {
    const { start, end, waypoints } = req.query;

    if (!start || !end) {
      return res.status(400).json({
        success: false,
        message: 'Both "start" and "end" query parameters (format: lat,lng) are required.'
      });
    }

    const [startLatStr, startLngStr] = start.split(',');
    const [endLatStr, endLngStr] = end.split(',');

    const startLat = parseFloat(startLatStr);
    const startLng = parseFloat(startLngStr);
    const endLat = parseFloat(endLatStr);
    const endLng = parseFloat(endLngStr);

    if (isNaN(startLat) || isNaN(startLng) || isNaN(endLat) || isNaN(endLng)) {
      return res.status(400).json({
        success: false,
        message: 'Coordinates must be valid numbers.'
      });
    }

    const routes = await mapService.calculateAlternativeRoutes(startLat, startLng, endLat, endLng, waypoints);

    return res.status(200).json({
      success: true,
      data: routes
    });
  } catch (error) {
    console.error('Error in getRoute controller:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error during path routing.'
    });
  }
};

// Get flood zone heatmap clusters
exports.getFloodZoneHeatmap = async (req, res) => {
  try {
    const heatmapZones = await mapService.getFloodZoneHeatmap();
    return res.status(200).json({
      success: true,
      data: heatmapZones
    });
  } catch (error) {
    console.error('Error fetching flood zone heatmap:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch flood zone heatmap clusters'
    });
  }
};

// Reverse geocoding query proxy
exports.reverseGeocode = async (req, res) => {
  try {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: 'Query parameters "lat" and "lng" are required.'
      });
    }

    const result = await mapService.reverseGeocode(parseFloat(lat), parseFloat(lng));

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error in reverseGeocode controller:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error during reverse geocoding.'
    });
  }
};

/**
 * GET /api/map/emergency-facilities?lat=...&lng=...&radius=3000
 * Queries Goong Places API to find nearby emergency facilities
 */
exports.getEmergencyFacilities = async (req, res) => {
  try {
    const { lat, lng, radius } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: 'Query parameters "lat" and "lng" are required.'
      });
    }

    const result = await mapService.getEmergencyFacilities(lat, lng, radius || 3000);

    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error in getEmergencyFacilities controller:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error fetching emergency facilities.'
    });
  }
};
