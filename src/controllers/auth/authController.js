const authService = require('../../services/auth/authService');

exports.register = async (req, res) => {
  try {
    const { email, password, full_name } = req.body;
    const result = await authService.registerUser(email, password, full_name);
    
    return res.status(201).json(result);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        message: error.message,
        isPending: error.isPending,
        ...error.meta
      });
    }
    console.error('Error in register controller:', error);
    return res.status(500).json({ message: 'An error occurred during registration. Please try again later.' });
  }
};



exports.login = async (req, res) => {
  try {
    const { email, password, rememberMe } = req.body;
    
    const { user, token, refreshToken } = await authService.loginUser(email, password, rememberMe, req.ip);

    const cookieOptions = {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    };
    if (rememberMe) {
      cookieOptions.maxAge = 30 * 24 * 60 * 60 * 1000;
    }

    res.cookie('token', token, cookieOptions);

    return res.status(200).json({
      message: 'Login successful.',
      token,
      refreshToken,
      user: {
        id: user._id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        roles: user.roles,
        avatar_url: user.avatar_url,
      },
      role: user.role,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        message: error.message,
        isPending: error.isPending,
        ...(error.meta || {}),
      });
    }
    console.error('Error in login controller:', error);
    return res.status(500).json({ message: 'An error occurred during login. Please try again later.' });
  }
};



exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    
    await authService.verifyOtpUser(email, otp);

    return res.status(200).json({
      message: 'Verification successful. Account has been activated and switched to User role.',
      role: 'User',
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        message: error.message,
        ...error.meta
      });
    }
    console.error('Error in verifyOtp controller:', error);
    return res.status(500).json({ message: 'An error occurred during verification. Please try again later.' });
  }
};



exports.resendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    
    const result = await authService.resendOtpUser(email);

    return res.status(200).json({
      message: 'A new OTP has been sent to your email.',
      ...result
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        message: error.message,
        ...error.meta
      });
    }
    console.error('Error in resendOtp controller:', error);
    return res.status(500).json({ message: 'An error occurred while resending OTP. Please try again later.' });
  }
};



exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    
    await authService.processForgotPassword(email);

    return res.status(200).json({ message: 'Verification code has been sent to your email.' });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error('Error in forgotPassword controller:', error);
    return res.status(500).json({ message: 'An error occurred. Please try again later.' });
  }
};



exports.verifyResetOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    
    const resetToken = await authService.verifyResetOtpUser(email, otp);

    return res.status(200).json({ message: 'OTP verification successful.', resetToken });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error('Error in verifyResetOtp controller:', error);
    return res.status(500).json({ message: 'Server error. Please try again.' });
  }
};



exports.resetPassword = async (req, res) => {
  try {
    const { email, resetToken, newPassword } = req.body;
    
    await authService.resetUserPassword(email, resetToken, newPassword);

    return res.status(200).json({ message: 'Password changed successfully. You can now login with your new password.' });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error('Error in resetPassword controller:', error);
    return res.status(500).json({ message: 'Server error. Please try again.' });
  }
};



exports.logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    await authService.revokeRefreshToken(refreshToken);

    res.clearCookie('token');
    return res.status(200).json({ message: 'Logout successful.' });
  } catch (error) {
    console.error('Error in logout controller:', error);
    return res.status(500).json({ message: 'Server error during logout.' });
  }
};



exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    const { token } = await authService.refreshAccessToken(refreshToken);

    return res.status(200).json({
      message: 'Token refreshed successfully.',
      token,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error('Error in refreshToken controller:', error);
    return res.status(500).json({ message: 'Server error while refreshing token.' });
  }
};

exports.googleLogin = async (req, res) => {
  try {
    const { idToken } = req.body;
    
    const { user, token, refreshToken } = await authService.loginGoogle(idToken);

    const cookieOptions = {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    };
    
    res.cookie('token', token, cookieOptions);

    return res.status(200).json({
      message: 'Google Login successful.',
      token,
      refreshToken,
      user: {
        id: user._id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        avatar_url: user.avatar_url,
      },
      role: user.role,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        message: error.message,
      });
    }
    console.error('Error in googleLogin controller:', error);
    return res.status(500).json({ message: 'An error occurred during Google Login. Please try again later.' });
  }
};
