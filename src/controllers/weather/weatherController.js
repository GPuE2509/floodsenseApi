const weatherService = require('../../services/weather/weatherService');

exports.getCurrentWeather = async (req, res) => {
  try {
    const { q, lat, lon } = req.query;
    const query = {};
    if (lat && lon) {
      query.lat = lat;
      query.lon = lon;
    } else if (q) {
      query.q = q;
    } else {
      query.q = 'Ho Chi Minh'; // Default fallback
    }

    const data = await weatherService.getCurrentWeather(query);
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Error fetching current weather:', error);
    res.status(500).json({ success: false, message: "Oops! We couldn't fetch the current weather. Please try again later or try a different keyword." });
  }
};

exports.getForecast = async (req, res) => {
  try {
    const { q, lat, lon } = req.query;
    const query = {};
    if (lat && lon) {
      query.lat = lat;
      query.lon = lon;
    } else if (q) {
      query.q = q;
    } else {
      query.q = 'Ho Chi Minh'; // Default fallback
    }

    const data = await weatherService.getForecast(query);
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Error fetching weather forecast:', error);
    res.status(500).json({ success: false, message: "Oops! We couldn't fetch the weather forecast. Please try again later or try a different keyword." });
  }
};
