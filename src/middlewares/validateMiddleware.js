const { EMAIL_REGEX, PASSWORD_REGEX } = require('../utils/authUtils');

exports.validateRegister = (req, res, next) => {
  const { email, password, confirmPassword, full_name } = req.body;

  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const normalizedFullName = (typeof full_name === 'string')
    ? full_name.replace(/\s+/g, ' ').trim()
    : '';

  if (!normalizedEmail || !password || !confirmPassword || !normalizedFullName) {
    return res.status(400).json({ message: 'Email, Password, Confirm Password and Full Name are required.' });
  }

  if (!EMAIL_REGEX.test(normalizedEmail)) {
    return res.status(400).json({ message: 'Invalid email.' });
  }

  if (!PASSWORD_REGEX.test(password)) {
    return res.status(400).json({ message: 'Password must be at least 8 characters long, contain at least 1 letter and 1 number, and no spaces.' });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ message: 'Password and Confirm Password must match.' });
  }

  if (normalizedFullName.length < 2) {
    return res.status(400).json({ message: 'Full name must be at least 2 characters long.' });
  }

  next();
};

exports.validateLogin = (req, res, next) => {
  const { email, password } = req.body;
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

  if (!normalizedEmail || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  next();
};

exports.validateVerifyOtp = (req, res, next) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    return res.status(400).json({ message: 'Email and OTP are required.' });
  }
  next();
};

exports.validateResendOtp = (req, res, next) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: 'Email is required.' });
  }
  next();
};

exports.validateForgotPassword = (req, res, next) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: 'Email is required.' });
  }
  next();
};

exports.validateVerifyResetOtp = (req, res, next) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    return res.status(400).json({ message: 'Email and OTP are required.' });
  }
  next();
};

exports.validateResetPassword = (req, res, next) => {
  const { email, resetToken, newPassword } = req.body;
  if (!email || !resetToken || !newPassword) {
    return res.status(400).json({ message: 'Please provide full information.' });
  }

  if (!PASSWORD_REGEX.test(newPassword)) {
    return res.status(400).json({ message: 'Password must be at least 8 characters long, contain at least 1 letter and 1 number, and no spaces.' });
  }
  next();
};

exports.validateChangePassword = (req, res, next) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Please provide current and new passwords.' });
  }

  if (currentPassword === newPassword) {
    return res.status(400).json({ message: 'New password must be different from the current one.' });
  }

  if (!PASSWORD_REGEX.test(newPassword)) {
    return res.status(400).json({ message: 'New password must be at least 8 characters long, contain at least 1 letter and 1 number.' });
  }
  next();
};
