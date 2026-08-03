const axios = require('axios');

const API_KEY = process.env.OPENWEATHER_API_KEY || '1b58407ef30f287951a8a6a0a194caea';
const CACHE_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// Simple in-memory cache
// Map key: query string (e.g., 'lat=10.7&lon=106.6' or 'q=Can Tho')
// Value: { timestamp: number, data: object }
const currentCache = new Map();
const forecastCache = new Map();

class WeatherService {
  /**
   * Generates a cache key based on query parameters
   */
  _getCacheKey(query) {
    if (query.lat && query.lon) {
      return `lat=${query.lat}&lon=${query.lon}`;
    }
    if (query.q) {
      return `q=${query.q.toLowerCase()}`;
    }
    return 'q=ho chi minh'; // default
  }

  /**
   * Fetches current weather data
   */
  async getCurrentWeather(query) {
    const key = this._getCacheKey(query);
    
    // Check Cache
    if (currentCache.has(key)) {
      const cached = currentCache.get(key);
      if (Date.now() - cached.timestamp < CACHE_DURATION_MS) {
        console.log(`[WeatherService] Serving CURRENT for '${key}' from cache`);
        return cached.data;
      }
    }

    // Fetch from API
    console.log(`[WeatherService] Fetching CURRENT for '${key}' from OpenWeatherMap`);
    let queryParam = key; // _getCacheKey returns exact param string
    // Force lang=en for English output
    const url = `https://api.openweathermap.org/data/2.5/weather?${queryParam}&units=metric&lang=en&appid=${API_KEY}`;
    
    const response = await axios.get(url);
    const data = response.data;

    // Save to Cache
    currentCache.set(key, { timestamp: Date.now(), data });
    return data;
  }

  /**
   * Fetches forecast weather data
   */
  async getForecast(query) {
    const key = this._getCacheKey(query);
    
    // Check Cache
    if (forecastCache.has(key)) {
      const cached = forecastCache.get(key);
      if (Date.now() - cached.timestamp < CACHE_DURATION_MS) {
        console.log(`[WeatherService] Serving FORECAST for '${key}' from cache`);
        return cached.data;
      }
    }

    // Fetch from API
    console.log(`[WeatherService] Fetching FORECAST for '${key}' from OpenWeatherMap`);
    let queryParam = key; 
    // Force lang=en for English output
    const url = `https://api.openweathermap.org/data/2.5/forecast?${queryParam}&units=metric&lang=en&appid=${API_KEY}`;
    
    const response = await axios.get(url);
    const data = response.data;

    // Save to Cache
    forecastCache.set(key, { timestamp: Date.now(), data });
    return data;
  }
}

module.exports = new WeatherService();
