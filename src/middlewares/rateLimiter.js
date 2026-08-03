const rateLimit = require('express-rate-limit');

// Middleware to limit total requests
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per 15 minutes
    message: { message: 'Too many requests from this IP, please try again later.' },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable `X-RateLimit-*` headers
    skip: (req) => {
        // Skip rate limit for admin
        return req.user?.roles?.includes('Admin');
    }
});

// Middleware to limit login requests
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per 15 minutes
    message: { message: 'Too many failed login attempts, please try again in 15 minutes.' },
    skipSuccessfulRequests: true, // Do not count successful requests
    keyGenerator: (req) => {
        // Use email or IP to distinguish
        return req.body?.email || req.ip || 'unknown';
    },
    validate: { keyGeneratorIpFallback: false }
});

// Middleware to limit email/OTP requests
const emailLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // 3 attempts per hour
    message: { message: 'Too many email requests, please try again in 1 hour.' },
    keyGenerator: (req) => {
        return req.body?.email || req.params?.email || req.ip || 'unknown';
    },
    validate: { keyGeneratorIpFallback: false }
});

// Middleware to limit report creation requests
const reportLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 reports per hour
    message: { message: 'Too many reports submitted, please try again in 1 hour.' },
    keyGenerator: (req) => req.user?._id || req.ip || 'unknown',
    validate: { keyGeneratorIpFallback: false }
});

// Middleware to limit SOS requests
const sosLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 2, // 2 SOS per minute
    message: { message: 'Too many SOS requests, please try again in 1 minute.' },
    keyGenerator: (req) => req.user?._id || req.ip || 'unknown',
    validate: { keyGeneratorIpFallback: false }
});

// Middleware to limit file upload requests
const uploadLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000, // 1 day
    max: 50, // 50 uploads per day
    message: { message: 'Too many file uploads, please try again tomorrow.' },
    keyGenerator: (req) => req.user?._id || req.ip || 'unknown',
    validate: { keyGeneratorIpFallback: false }
});

module.exports = {
    generalLimiter,
    loginLimiter,
    emailLimiter,
    reportLimiter,
    sosLimiter,
    uploadLimiter
};

