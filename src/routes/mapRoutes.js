const express = require('express');
const router = express.Router();
const mapController = require('../controllers/map/mapController');

// Route for map search query
router.get('/search', mapController.searchArea);

// Route for fetching active workshops
router.get('/workshops', mapController.getActiveWorkshops);

// Route for path calculation/routing
router.get('/route', mapController.getRoute);

// Route for flood zone heatmap clusters
router.get('/heatmap', mapController.getFloodZoneHeatmap);

// Route for reverse geocoding
router.get('/reverse', mapController.reverseGeocode);
// Route for fetching nearby emergency facilities via Overpass API (OSM)
router.get('/emergency-facilities', mapController.getEmergencyFacilities);

module.exports = router;
