//app
const express = require("express");
const cors = require("cors");
const path = require("path");
const cookieParser = require("cookie-parser"); // 1. Add this line
const authRoutes = require("./routes/authRoutes");
const volunteerRoutes = require("./routes/volunteerRoutes");
const workshopRoutes = require("./routes/workshopRoutes");
const IotRoutes = require("./routes/IotRoutes");
const mapRoutes = require("./routes/mapRoutes");
const chatRoutes = require("./routes/chatRoutes");
const weatherRoutes = require("./routes/weatherRoutes");
const incidentReportRoutes = require("./routes/incidentReportRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const warningZoneRoutes = require("./routes/warningZoneRoutes");
const warningRoadRoutes = require("./routes/warningRoadRoutes");
const forumRoutes = require("./routes/forumRoutes");
const leaderboardRoutes = require("./routes/leaderboardRoutes");
const rescueRoutes = require("./routes/rescueRoutes");
const adminRoutes = require("./routes/adminRoutes");
const emergencyGuidelineRoutes = require("./routes/emergencyGuidelineRoutes");

const app = express();
// ... (trimmed lines for brevity in replacement, let's keep lines 13-59 intact and target precisely)

// Fix express-rate-limit IPv6 issue
app.set('trust proxy', 1);

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
  });
  next();
});

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }
    const allowedOrigins = [
      'https://floodsense-blue.vercel.app',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:4000',
      'http://127.0.0.1:4000',
      'http://10.0.2.2:5000',
      'http://127.0.0.1:5000',
      'http://192.168.1.37:3000',
      'http://192.168.1.37:4000',
      'http://192.168.1.37:5000'
    ];
    const isLocalhost = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    if (allowedOrigins.includes(origin) || isLocalhost) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser()); // 2. Add this line (Must be placed BEFORE authRoutes)
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.use("/api/auth", authRoutes);
app.use("/api/profile", (req, res, next) => {
  req.url = '/profile' + req.url;
  authRoutes(req, res, next);
});
app.use("/api/volunteers", volunteerRoutes);
app.use("/api/workshops", workshopRoutes);
app.use("/api/iot", IotRoutes);
app.use("/api/map", mapRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/weather", weatherRoutes);
app.use("/api/incident-reports", incidentReportRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/warning-zones", warningZoneRoutes);
app.use("/api/warning-roads", warningRoadRoutes);
app.use("/api/forum", forumRoutes);
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api/rescue", rescueRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/emergency-guidelines", emergencyGuidelineRoutes);

// Legacy fallback for ESP32 telemetry
const IotController = require('./controllers/iot/IotController');
app.post('/gps', IotController.receiveTelemetry);

app.get("/", (req, res) => {
  res.send("API is running...");
});

module.exports = app;