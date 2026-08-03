const { authenticateUser, authorizeRoles } = require('./auth');
const {
    generalLimiter,
    loginLimiter,
    emailLimiter,
    reportLimiter,
    sosLimiter,
    uploadLimiter
} = require('./rateLimiter');

module.exports = {
    // Authentication & Authorization
    authenticateUser,
    authorizeRoles,
    
    // Rate Limiting
    generalLimiter,
    loginLimiter,
    emailLimiter,
    reportLimiter,
    sosLimiter,
    uploadLimiter
};
