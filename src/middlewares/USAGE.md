/**
 * HƯỚNG DẪN SỬ DỤNG MIDDLEWARE
 * 
 * Đây là ví dụ về cách sử dụng các middleware trong app.js
 */

const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const dotenv = require('dotenv');

const {
    authenticateUser,
    authorizeRoles,
    generalLimiter,
    loginLimiter,
    emailLimiter,
    reportLimiter,
    sosLimiter,
    uploadLimiter
} = require('./middleware');

dotenv.config();
const app = express();

// ===== MIDDLEWARE TOÀN CỤC =====

// CORS configuration
app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true
}));

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Cookie parser
app.use(cookieParser());

// Rate limiting chung
app.use(generalLimiter);

// ===== ROUTES =====

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'Server is running' });
});

// Auth routes
// app.use('/api/auth', require('./routes/auth'));

// User routes
// app.use('/api/users', require('./routes/users'));

// Workshop routes
// app.use('/api/workshops', require('./routes/workshops'));

// IoT Device routes
// app.use('/api/iot-devices', require('./routes/iotDevices'));

// Incident Report routes
// app.use('/api/incident-reports', require('./routes/incidentReports'));

// Rescue Session routes
// app.use('/api/rescue-sessions', require('./routes/rescueSessions'));

// Forum routes
// app.use('/api/forum', require('./routes/forum'));

// Notification routes
// app.use('/api/notifications', require('./routes/notifications'));

module.exports = app;


/**
 * ===== HƯỚNG DẪN CHI TIẾT =====
 * 
 * 1. AUTHENTICATION & AUTHORIZATION
 * 
 *    // Bảo vệ route yêu cầu xác thực
 *    router.get('/profile', authenticateUser, (req, res) => {
 *        res.json(req.user);
 *    });
 *    
 *    // Bảo vệ route chỉ cho Admin và Moderator
 *    router.delete('/users/:id', 
 *        authenticateUser, 
 *        authorizeRoles('Admin', 'Moderator'),
 *        deleteUserController
 *    );
 * 
 * 2. RATE LIMITING
 * 
 *    router.post('/auth/login', loginLimiter, loginController);
 *    router.post('/auth/send-otp', emailLimiter, sendOtpController);
 *    router.post('/incident-reports', reportLimiter, createReportController);
 *    router.post('/rescue-sessions/sos', sosLimiter, createSosController);
 */
