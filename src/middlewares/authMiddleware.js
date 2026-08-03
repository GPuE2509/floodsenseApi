const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authenticateUser = async (req, res, next) => {
    let token = req.header('Authorization')?.split(' ')[1];
    if (!token || token === 'undefined' || token === 'null') {
        token = req.cookies?.token;
    }

    if (!token) {
        return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = await User.findById(decoded.userId).select('-password_hash');

        if (!req.user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Token expired.' });
        }
        res.status(401).json({ message: 'Invalid token.' });
    }
};

const authorizeRoles = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required.' });
        }

        // Check if user has at least one role in the allowed list
        const userRoles = req.user.roles || (req.user.role ? [req.user.role] : []);
        const userHasRole = roles.some(role => userRoles.includes(role));

        if (!userHasRole) {
            return res.status(403).json({
                message: `Access denied, requires role: ${roles.join(', ')}`
            });
        }

        next();
    };
};

const authenticateUserOptional = async (req, res, next) => {
    let token = req.header('Authorization')?.split(' ')[1];
    if (!token || token === 'undefined' || token === 'null') {
        token = req.cookies?.token;
    }

    if (!token) {
        return next();
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = await User.findById(decoded.userId).select('-password_hash');
        next();
    } catch (err) {
        next();
    }
};

module.exports = {
    authenticateUser,
    authenticateUserOptional,
    authorizeRoles
};