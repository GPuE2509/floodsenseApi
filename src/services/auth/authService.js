const bcrypt = require('bcrypt');
const User = require('../../models/User');
const { 
  BCRYPT_SALT_ROUNDS, generateOtp, OTP_TTL_MINUTES, OTP_RESEND_COOLDOWN_SECONDS, 
  getOtpMeta, getPendingRegisterMeta, OTP_MAX_RESENDS, signAuthToken, signRefreshToken, canResendOtp 
} = require('../../utils/authUtils');
const { sendVerificationEmail, sendPasswordResetEmail, sendGoogleLoginWelcomeEmail } = require('../../utils/sendEmail');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const RefreshToken = require('../../models/RefreshToken');
const { verifyFirebaseIdToken } = require('../../utils/firebaseAuth');


exports.registerUser = async (email, password, full_name) => {
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const normalizedFullName = (typeof full_name === 'string')
    ? full_name.replace(/\s+/g, ' ').trim()
    : '';

  const titleCasedFullName = normalizedFullName
    .split(' ')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ''))
    .join(' ');



  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    if (existingUser.status === 'Pending') {
      const pendingMeta = getPendingRegisterMeta(existingUser);
      const resendLimitReached = (existingUser.otp_resend_count || 0) >= OTP_MAX_RESENDS;
      
      const error = new Error(resendLimitReached
        ? 'This email has reached the limit for resending OTP. You can register again with this email after 24 hours.'
        : 'Email already exists and is pending verification. Please check your email or resend OTP to verify the account.');
      error.status = 409;
      error.isPending = true;
      error.meta = {
        ...getOtpMeta(existingUser),
        ...pendingMeta,
        resend_limit_reached: resendLimitReached,
      };
      throw error;
    }
    const error = new Error('Email has been used. Please use a different email.');
    error.status = 409;
    throw error;
  }

  const password_hash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
  const otp = generateOtp();
  const now = new Date();
  const otp_expired = new Date(now.getTime() + OTP_TTL_MINUTES * 60 * 1000);

  const user = new User({
    email: normalizedEmail,
    password_hash,
    full_name: titleCasedFullName,

    status: 'Pending',
    is_verified: false,
    role: 'Guest',
    otp,
    otp_expired,
    otp_sent_at: now,
    otp_resend_available_at: new Date(now.getTime() + OTP_RESEND_COOLDOWN_SECONDS * 1000),
    otp_resend_count: 0,
  });

  await user.save();
  await sendVerificationEmail(normalizedEmail, otp);

  return {
    message: 'Registration successful. Please check your email for the OTP verification code and activate your account.',
    ...getOtpMeta(user),
  };
};



exports.loginUser = async (email, password, rememberMe, ipAddress) => {
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    const error = new Error('Incorrect email or password.');
    error.status = 401;
    throw error;
  }

  if (user.status === 'Pending' || !user.is_verified) {
    const error = new Error('Account not verified. Please verify OTP before logging in.');
    error.status = 403;
    error.isPending = true;
    error.meta = {
      ...getOtpMeta(user),
      ...getPendingRegisterMeta(user),
    };
    throw error;
  }

  if (user.status === 'Suspended') {
    const error = new Error('Your account has been locked. Please contact Admin for support.');
    error.status = 403;
    throw error;
  }

  const isPasswordValid = await bcrypt.compare(password, user.password_hash);
  if (!isPasswordValid) {
    const error = new Error('Incorrect email or password.');
    error.status = 401;
    throw error;
  }

  const token = signAuthToken(user);
  const refreshToken = signRefreshToken(user, rememberMe);

  // Save Refresh Token to Database
  const decodedRefresh = jwt.decode(refreshToken);
  await new RefreshToken({
    token: refreshToken,
    user: user._id,
    expiresAt: new Date(decodedRefresh.exp * 1000)
  }).save();

  // Security check for unusual login activity
  if (ipAddress) {
    if (user.last_login_ip && user.last_login_ip !== ipAddress) {
      try {
        const Notification = require('../../models/Notification');
        const title = `Unusual Login Security Alert: ${user.email}`;
        const body = `Your account logged in from a new IP address: ${ipAddress}. If this wasn't you, please secure your account immediately.`;

        // 1. Notify user
        await Notification.create({
          recipient_id: user._id,
          title,
          body,
          type: 'System_Alert',
          metadata: {
            sender_name: 'Security System',
            web_url: '/profile'
          }
        });

        // 2. Notify admin role
        await Notification.create({
          recipient_role: 'Admin',
          title,
          body: `Account ${user.email} logged in from a new IP address (${ipAddress}).`,
          type: 'System_Alert',
          metadata: {
            sender_name: 'Security System',
            web_url: '/admin/accounts'
          }
        });
      } catch (err) {
        console.error('Failed to trigger unusual login alerts:', err);
      }
    }
    user.last_login_ip = ipAddress;
    await user.save();
  }

  return {
    user,
    token,
    refreshToken
  };
};



exports.verifyOtpUser = async (email, otp) => {
  const normalizedEmail = email.trim().toLowerCase();
  
  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    const error = new Error('User does not exist.');
    error.status = 404;
    throw error;
  }

  if (user.is_verified) {
    const error = new Error('Account was already verified.');
    error.status = 400;
    throw error;
  }

  if (!user.otp_expired || new Date() > user.otp_expired) {
    const error = new Error('OTP code has expired. Please resend OTP.');
    error.status = 410;
    error.meta = getOtpMeta(user);
    throw error;
  }

  if (user.otp !== otp) {
    const error = new Error('Incorrect OTP code.');
    error.status = 400;
    throw error;
  }

  user.is_verified = true;
  user.status = 'Active';
  user.role = 'User';
  user.otp = undefined;
  user.otp_expired = undefined;
  user.otp_sent_at = undefined;
  user.otp_resend_available_at = undefined;
  user.otp_resend_count = 0;
  
  await user.save();
};



exports.resendOtpUser = async (email) => {
  const normalizedEmail = email.trim().toLowerCase();

  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    const error = new Error('User does not exist.');
    error.status = 404;
    throw error;
  }

  if (user.is_verified) {
    const error = new Error('Account has been verified.');
    error.status = 400;
    throw error;
  }
  
  if (user.status !== 'Pending') {
    const error = new Error('Cannot send OTP code to this account.');
    error.status = 400;
    throw error;
  }

  const now = new Date();
  const cooldownCheck = canResendOtp(user, now);
  if (!cooldownCheck.allowed) {
    if (cooldownCheck.retryAfterSeconds) {
      const error = new Error(`Please wait ${cooldownCheck.retryAfterSeconds} seconds before resending OTP.`);
      error.status = 429;
      error.meta = {
        retry_after_seconds: cooldownCheck.retryAfterSeconds,
        ...getOtpMeta(user),
      };
      throw error;
    }

    const error = new Error('You have reached the limit for resending OTP.');
    error.status = 429;
    error.meta = {
      retry_after_seconds: null,
      ...getOtpMeta(user),
      ...getPendingRegisterMeta(user),
    };
    throw error;
  }

  const otp = generateOtp();
  user.otp = otp;
  user.otp_expired = new Date(now.getTime() + OTP_TTL_MINUTES * 60 * 1000);
  user.otp_sent_at = now;
  user.otp_resend_count = (user.otp_resend_count || 0) + 1;
  user.otp_resend_available_at = new Date(now.getTime() + OTP_RESEND_COOLDOWN_SECONDS * 1000);

  await user.save();
  await sendVerificationEmail(user.email, otp);

  return {
    retry_after_seconds: OTP_RESEND_COOLDOWN_SECONDS,
    ...getOtpMeta(user),
  };
};



exports.processForgotPassword = async (email) => {
  const normalizedEmail = email.trim().toLowerCase();
  
  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    const error = new Error('Email does not exist in the system.');
    error.status = 404;
    throw error;
  }

  if (user.status === 'Pending' || !user.is_verified) {
    const error = new Error('Your account is not yet verified. Please complete account verification first.');
    error.status = 403;
    throw error;
  }

  const now = new Date();
  const cooldownCheck = canResendOtp(user, now);
  if (!cooldownCheck.allowed) {
    if (cooldownCheck.retryAfterSeconds) {
      const error = new Error(`Please wait ${cooldownCheck.retryAfterSeconds} seconds before resending OTP.`);
      error.status = 429;
      error.meta = {
        retry_after_seconds: cooldownCheck.retryAfterSeconds,
        ...getOtpMeta(user),
      };
      throw error;
    }

    const error = new Error(`You have reached the password recovery request limit (${OTP_MAX_RESENDS} times). Please try again after 24 hours.`);
    error.status = 429;
    error.meta = {
      retry_after_seconds: null,
      ...getOtpMeta(user),
    };
    throw error;
  }

  const otp = generateOtp();

  user.otp = otp;
  user.otp_expired = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes
  user.otp_sent_at = now;
  user.otp_resend_count = (user.otp_resend_count || 0) + 1;
  user.otp_resend_available_at = new Date(now.getTime() + OTP_RESEND_COOLDOWN_SECONDS * 1000);

  await user.save();
  await sendPasswordResetEmail(normalizedEmail, otp);
};



exports.verifyResetOtpUser = async (email, otp) => {
  const normalizedEmail = email.trim().toLowerCase();
  
  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    const error = new Error('Email does not exist.');
    error.status = 404;
    throw error;
  }

  if (!user.otp_expired || new Date() > user.otp_expired) {
    const error = new Error('OTP code has expired. Please request again.');
    error.status = 410;
    throw error;
  }

  if (user.otp !== otp) {
    const error = new Error('Incorrect OTP code.');
    error.status = 400;
    throw error;
  }

  const resetToken = crypto.randomBytes(32).toString('hex');
  user.otp = undefined;
  user.otp_expired = undefined;
  user.reset_token = resetToken;
  user.reset_token_expired = new Date(Date.now() + 15 * 60 * 1000); // 15 mins
  await user.save();

  return resetToken;
};



exports.resetUserPassword = async (email, resetToken, newPassword) => {
  const normalizedEmail = email.trim().toLowerCase();
  
  const user = await User.findOne({ email: normalizedEmail, reset_token: resetToken });
  if (!user) {
    const error = new Error('Token is invalid or does not match the email.');
    error.status = 400;
    throw error;
  }

  if (!user.reset_token_expired || new Date() > user.reset_token_expired) {
    const error = new Error('Password reset session has expired. Please start over.');
    error.status = 410;
    throw error;
  }

  const password_hash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
  user.password_hash = password_hash;
  user.reset_token = undefined;
  user.reset_token_expired = undefined;

  await user.save();
};



exports.revokeRefreshToken = async (refreshToken) => {
  if (refreshToken) {
    await RefreshToken.deleteOne({ token: refreshToken });
  }
};



exports.refreshAccessToken = async (refreshToken) => {
  if (!refreshToken) {
    const error = new Error('Refresh token is required.');
    error.status = 401;
    throw error;
  }

  // Verify Refresh Token
  let decoded;
  try {
    decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET);
  } catch (err) {
    // Revoke if token is invalid (expired or forged) to clean up
    await RefreshToken.deleteOne({ token: refreshToken });
    const error = new Error('Refresh token is invalid or expired. Please login again.');
    error.status = 403;
    throw error;
  }

  // Check in database
  const existingToken = await RefreshToken.findOne({ token: refreshToken, user: decoded.userId });
  if (!existingToken) {
    const error = new Error('Refresh token does not exist or has been revoked. Please login again.');
    error.status = 403;
    throw error;
  }

  // Get current user info (to update latest role/status if any)
  const user = await User.findById(decoded.userId);
  if (!user || user.status === 'Suspended') {
    await RefreshToken.deleteOne({ token: refreshToken });
    const error = new Error('Account is locked or does not exist.');
    error.status = 403;
    throw error;
  }

  // Issue new Access Token
  const newAccessToken = signAuthToken(user);

  return { token: newAccessToken };
};

exports.loginGoogle = async (idToken) => {
  if (!idToken) {
    const error = new Error('Google ID Token is required.');
    error.status = 400;
    throw error;
  }

  let decodedToken;
  try {
    decodedToken = await verifyFirebaseIdToken(idToken);
  } catch (err) {
    console.error('Firebase token verification failed:', err);
    try {
      require('fs').appendFileSync(
        require('path').join(__dirname, '../../../verification_error.log'),
        `[${new Date().toISOString()}] Firebase verification failed:\nError: ${err.message}\nStack: ${err.stack}\nToken: ${idToken}\n\n`
      );
    } catch (fsErr) {
      console.error('Failed to write to verification_error.log:', fsErr);
    }
    const error = new Error(`Invalid Google ID Token: ${err.message}`);
    error.status = 401;
    throw error;
  }

  const { email, name, picture, sub } = decodedToken;
  if (!email) {
    const error = new Error('Email claim is missing in Google Token.');
    error.status = 400;
    throw error;
  }

  // Find user by email or google_id
  let user = await User.findOne({ 
    $or: [
      { email: email.toLowerCase() },
      { google_id: sub }
    ]
  });

  if (!user) {
    // Generate an 8-character random password containing alphanumeric characters (must have at least 1 letter and 1 digit)
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    const digits = '0123456789';
    const allChars = letters + digits;
    
    let tempPassword = '';
    tempPassword += letters.charAt(Math.floor(Math.random() * letters.length));
    tempPassword += digits.charAt(Math.floor(Math.random() * digits.length));
    for (let i = 0; i < 6; i++) {
      tempPassword += allChars.charAt(Math.floor(Math.random() * allChars.length));
    }
    // Shuffle the characters
    tempPassword = tempPassword.split('').sort(() => 0.5 - Math.random()).join('');

    // Hash the temporary password
    const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_SALT_ROUNDS);

    // Create a new user for Google sign in
    user = new User({
      email: email.toLowerCase(),
      password_hash: passwordHash,
      full_name: name || email.split('@')[0],
      google_id: sub,
      avatar_url: picture,
      status: 'Active',
      is_verified: true,
      role: 'User',
    });
    await user.save();

    // Send welcome email with temporary password asynchronously
    sendGoogleLoginWelcomeEmail(email.toLowerCase(), user.full_name, tempPassword).catch((emailErr) => {
      console.error('Failed to send Google login welcome email:', emailErr);
    });
  } else {
    // Check if user has Manager or Admin role - disallow Google login for these roles
    const normalizedRole = (user.role || '').toLowerCase();
    if (normalizedRole === 'manager' || normalizedRole === 'admin') {
      const error = new Error('Google login is not allowed for Manager and Admin accounts. Please log in using email and password.');
      error.status = 403;
      throw error;
    }

    // Update user info if needed
    let isModified = false;
    if (!user.google_id) {
      user.google_id = sub;
      isModified = true;
    }
    if (!user.avatar_url && picture) {
      user.avatar_url = picture;
      isModified = true;
    }
    if (user.status === 'Pending') {
      user.status = 'Active';
      user.is_verified = true;
      user.role = 'User';
      isModified = true;
    } else if (user.status === 'Suspended') {
      const error = new Error('Your account has been locked. Please contact Admin for support.');
      error.status = 403;
      throw error;
    }

    if (isModified) {
      await user.save();
    }
  }

  const token = signAuthToken(user);
  const refreshToken = signRefreshToken(user, true); // default rememberMe for Google login

  // Save Refresh Token to Database
  const decodedRefresh = jwt.decode(refreshToken);
  await new RefreshToken({
    token: refreshToken,
    user: user._id,
    expiresAt: new Date(decodedRefresh.exp * 1000)
  }).save();

  return {
    user,
    token,
    refreshToken
  };
};
