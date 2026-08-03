const jwt = require('jsonwebtoken');

const EMAIL_REGEX = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)(?!.*\s).{8,}$/;
const OTP_TTL_MINUTES = 2;
const OTP_RESEND_COOLDOWN_SECONDS = 60;
const OTP_MAX_RESENDS = 5;
const PENDING_USER_TTL_SECONDS = 24 * 60 * 60;
const BCRYPT_SALT_ROUNDS = 10;

const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

const getOtpMeta = (user) => ({
  otp_expires_at: user.otp_expired || null,
  otp_resend_available_at: user.otp_resend_available_at || null,
  otp_resend_count: user.otp_resend_count || 0,
  otp_max_resends: OTP_MAX_RESENDS,
  resend_limit_reached: (user.otp_resend_count || 0) >= OTP_MAX_RESENDS,
});

const getPendingRegisterMeta = (user) => ({
  can_register_again_at: user.created_at
    ? new Date(new Date(user.created_at).getTime() + PENDING_USER_TTL_SECONDS * 1000).toISOString()
    : null,
});

const signAuthToken = (user) => {
  return jwt.sign(
    {
      userId: user._id.toString(),
      role: user.role,
      roles: user.roles,
    },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
};

const signRefreshToken = (user, rememberMe = false) => {
  const expiresIn = rememberMe ? '30d' : '1d';
  return jwt.sign(
    {
      userId: user._id.toString(),
    },
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET, // Fallback to JWT_SECRET if not set
    { expiresIn }
  );
};

const canResendOtp = (user, now = new Date()) => {
  // Reset count if it's been more than 24 hours since the last OTP was sent
  if (user.otp_sent_at && (now.getTime() - new Date(user.otp_sent_at).getTime()) > 24 * 60 * 60 * 1000) {
    user.otp_resend_count = 0;
  }

  const availableAt = user.otp_resend_available_at ? new Date(user.otp_resend_available_at) : null;
  if (availableAt && now < availableAt) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((availableAt.getTime() - now.getTime()) / 1000)),
    };
  }

  if ((user.otp_resend_count || 0) >= OTP_MAX_RESENDS) {
    return {
      allowed: false,
      retryAfterSeconds: null,
    };
  }

  return { allowed: true, retryAfterSeconds: 0 };
};

module.exports = {
  EMAIL_REGEX,
  PASSWORD_REGEX,
  OTP_TTL_MINUTES,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_MAX_RESENDS,
  PENDING_USER_TTL_SECONDS,
  BCRYPT_SALT_ROUNDS,
  generateOtp,
  getOtpMeta,
  getPendingRegisterMeta,
  signAuthToken,
  signRefreshToken,
  canResendOtp,
};
