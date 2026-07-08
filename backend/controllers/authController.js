const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { validationResult } = require('express-validator');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const BlacklistedToken = require('../models/BlacklistedToken');
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ============================================
// TOKEN GENERATION
// ============================================

const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

const buildAuthResponse = (user, token) => ({
  token,
  user: {
    id: user._id,
    username: user.username,
    email: user.email,
    avatarUrl: user.avatarUrl,
    provider: user.provider,
    role: user.role || 'user',
  },
});

// ============================================
// AUTH CONTROLLERS
// ============================================

// @desc    Register user
// @route   POST /api/auth/register
const register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        error: "Username, email, and password are required."
      });
    }
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      const field = existingUser.email === email ? 'Email' : 'Username';
      return res.status(400).json({ error: `${field} is already in use.` });
    }

    const user = await User.create({ username, email, password });
    const token = generateToken(user._id);

    res.status(201).json({
      message: 'Account created successfully!',
      ...buildAuthResponse(user, token),
    });
  } catch (err) {
    console.error('Register error:', err);
    if (err.code === 11000) {
      const field = err.keyPattern?.email ? 'Email' : 'Username';
      return res.status(400).json({ error: `${field} is already in use.` });
    }
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
const login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        error: "Email and password are required."
      });
    }
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = generateToken(user._id);

    res.json({
      message: 'Login successful!',
      ...buildAuthResponse(user, token),
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
};

// @desc    Logout user - Blacklist token
// @route   POST /api/auth/logout
const logout = async (req, res) => {
  try {
    const token = req.token;

    if (!token) {
      return res.status(400).json({ 
        success: false,
        error: 'No token provided for logout.' 
      });
    }

    await BlacklistedToken.blacklist(
      token,
      req.user._id,
      'LOGOUT',
      req.ip || req.connection?.remoteAddress,
      req.headers['user-agent']
    );

    res.json({ 
      success: true,
      message: 'Successfully logged out. Token revoked.'
    });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ 
      success: false,
      error: 'Server error during logout.' 
    });
  }
};

// @desc    Get current user
// @route   GET /api/auth/me
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
};

// @desc    Google OAuth login
// @route   POST /api/auth/google
const googleLogin = async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ error: 'Google ID Token is required.' });
    }

    const ticket = await client.verifyIdToken({
      idToken: idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    let user = await User.findOne({ email });

    if (user) {
      if (!user.googleId) {
        user.googleId = googleId;
        user.provider = 'google';
        if (picture && !user.avatarUrl) {
          user.avatarUrl = picture;
        }
        await user.save();
      }
    } else {
      let baseUsername = name ? name.replace(/\s+/g, '').toLowerCase() : email.split('@')[0];
      let username = baseUsername;

      const regex = new RegExp(`^${baseUsername}(\\d*)$`);
      const existingUsers = await User.find({ username: regex }).select('username').lean();

      if (existingUsers.length > 0) {
        const exactMatch = existingUsers.find(u => u.username === baseUsername);
        if (exactMatch) {
          let maxCounter = 0;
          existingUsers.forEach(u => {
            const match = u.username.match(regex);
            if (match && match[1]) {
              const num = parseInt(match[1]);
              if (num > maxCounter) maxCounter = num;
            }
          });
          username = `${baseUsername}${maxCounter + 1}`;
        }
      }

      user = await User.create({
        username,
        email,
        googleId,
        avatarUrl: picture,
        provider: 'google',
      });
    }

    const token = generateToken(user._id);

    res.json({
      message: 'Login successful!',
      ...buildAuthResponse(user, token),
    });
  } catch (err) {
    console.error('Google Auth Error:', err);
    res.status(400).json({ error: 'Invalid Google token.' });
  }
};

// @desc    Update user avatar
// @route   POST /api/auth/avatar
const updateAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filename = `${req.user.id}-${Date.now()}.webp`;
    const filepath = path.join(__dirname, '..', 'uploads', filename);

    await sharp(req.file.buffer)
      .resize(250, 250, { fit: 'cover' })
      .toFormat('webp')
      .toFile(filepath);

    const avatarUrl = `${req.protocol}://${req.get('host')}/uploads/${filename}`;

    const currentUser = await User.findById(req.user.id);
    if (currentUser && currentUser.avatarUrl && currentUser.avatarUrl.includes('/uploads/')) {
      try {
        const oldFilename = currentUser.avatarUrl.split('/uploads/')[1];
        const oldFilePath = path.join(__dirname, '..', 'uploads', oldFilename);
        await fs.promises.access(oldFilePath);
        await fs.promises.unlink(oldFilePath);
      } catch (err) {
        if (err.code !== 'ENOENT') {
          console.error('Failed to delete old avatar:', err);
        }
      }
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { avatarUrl },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'Avatar updated successfully', user });
  } catch (err) {
    console.error('Avatar upload error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
};

// @desc    Forgot password - Send reset link
// @route   POST /api/auth/forgot-password
const forgotPassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.json({ message: 'If an account with that email exists, a reset link has been sent.' });
    }

    const secret = process.env.JWT_SECRET + user.password;
    const token = jwt.sign(
      { id: user._id, email: user.email }, 
      secret, 
      { expiresIn: process.env.PASSWORD_RESET_TOKEN_EXPIRES || '15m' }
    );

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    const resetLink = `${clientUrl}/reset-password/${user._id}/${token}`;

    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.ethereal.email',
      port: process.env.EMAIL_PORT || 587,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const emailFrom = process.env.EMAIL_FROM || '"Spam Detection System" <noreply@spamdetection.local>';

    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      await transporter.sendMail({
        from: emailFrom,
        to: user.email,
        subject: 'Password Reset Request',
        text: `Please use the following link to reset your password: ${resetLink} \n\nThis link expires in 15 minutes.`,
      });
    } else {
      console.log(`[DEMO] Password Reset Link for ${user.email}: ${resetLink}`);
    }

    res.json({ message: 'If an account with that email exists, a reset link has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Server error. Please try again later.' });
  }
};

// @desc    Reset password
// @route   POST /api/auth/reset-password/:id/:token
const resetPassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const { id, token } = req.params;
    const { password } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired token.' });
    }

    const secret = process.env.JWT_SECRET + user.password;
    try {
      jwt.verify(token, secret);
    } catch (err) {
      return res.status(400).json({ error: 'Invalid or expired token.' });
    }

    user.password = password;
    await user.save();

    res.json({ message: 'Password has been successfully reset. You can now login.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Server error. Please try again later.' });
  }
};

// @desc    Change password (authenticated)
// @route   POST /api/auth/change-password
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        success: false,
        error: 'Current password and new password are required.' 
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ 
        success: false,
        error: 'New password must be at least 6 characters.' 
      });
    }

    const user = await User.findById(req.user.id).select('+password');
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found.' 
      });
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ 
        success: false,
        error: 'Current password is incorrect.' 
      });
    }

    user.password = newPassword;
    await user.save();

    await BlacklistedToken.invalidateAllUserTokens(
      user._id,
      'PASSWORD_CHANGE',
      req.token,
      req.ip || req.connection?.remoteAddress,
      req.headers['user-agent']
    );

    res.json({ 
      success: true,
      message: 'Password changed successfully. All sessions invalidated. Please login again.'
    });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ 
      success: false,
      error: 'Server error. Please try again later.' 
    });
  }
};

// @desc    Update webhook URL
// @route   PUT /api/auth/webhook
const updateWebhook = async (req, res) => {
  try {
    const { webhookUrl } = req.body;
    
    const newWebhookValue = (webhookUrl && webhookUrl.trim() !== '') ? webhookUrl.trim() : null;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { webhookUrl: newWebhookValue },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'Webhook URL updated successfully!', user });
  } catch (err) {
    console.error('Webhook update error:', err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: 'Invalid Webhook URL format. Must start with http:// or https://' });
    }
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
};

const logout = async (req, res) => {
  try {
    const token = req.token;
    const decoded = jwt.decode(token);
    
    const now = Math.floor(Date.now() / 1000);
    const timeUntilExpiry = decoded.exp - now;
    
    res.json({
      success: true,
      expiresIn: timeUntilExpiry,
      expiresAt: new Date(decoded.exp * 1000),
      isExpiringSoon: timeUntilExpiry < 300
    });
  } catch (err) {
    res.status(500).json({ 
      success: false,
      error: 'Failed to get session status' 
    });
  }
};


// ============================================
// 📌 EXPORTS - ONLY ONCE AT THE VERY END
// ============================================

module.exports = { 
  register, 
  login, 
  logout, 
  getMe, 
  googleLogin, 
  updateAvatar, 
  forgotPassword, 
  resetPassword,
  changePassword,
  updateWebhook,
  getSessionStatus,
  generateToken,
  buildAuthResponse
};

module.exports = { register, login, logout, getMe, googleLogin, updateAvatar, forgotPassword, resetPassword, updateWebhook };

