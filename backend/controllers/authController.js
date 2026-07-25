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
const emailTransporter = require('../utils/emailTransporter');

// ============================================
// TOKEN GENERATION
// ============================================

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
    permissions: user.permissions || [],
  },
});

// ============================================
// AUTH CONTROLLERS
// ============================================

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

    // Check if account is locked
    if (user.isLocked && user.isLocked()) {
      return res.status(429).json({
        success: false,
        error: 'Account locked due to too many failed attempts. Please try again later.'
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      // Increment login attempts
      if (user.incrementLoginAttempts) {
        await user.incrementLoginAttempts();
      }
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Reset login attempts on success
    if (user.updateLastLogin) {
      await user.updateLastLogin();
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

const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
};

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

    if (!payload) {
      return res.status(400).json({ error: 'Invalid Google token payload.' });
    }
    // 1. Email must be verified by Google
    if (!payload.email_verified) {
      return res.status(400).json({ error: 'Google email is not verified. Please verify your email on Google.' });
    }
    // 2. Issuer must be exactly Google's trusted issuer
    const allowedIssuers = ['https://accounts.google.com', 'accounts.google.com'];
    if (!allowedIssuers.includes(payload.iss)) {
      return res.status(400).json({ error: `Invalid token issuer: ${payload.iss}` });
    }
    // 3. Audience must match our Client ID (Security check)
    if (payload.aud !== process.env.GOOGLE_CLIENT_ID) {
      return res.status(400).json({ error: 'Invalid token audience.' });
    }
    // 4. Subject (unique Google ID) must exist
    if (!payload.sub) {
      return res.status(400).json({ error: 'Missing subject (sub) in Google token.' });
    }
    // ==========================================

    const { sub: googleId, email, name, picture } = payload;

    // Pehle check karo ki user exist karta hai ya nahi
    let user = await User.findOne({ email });

    if (user) {
      // Agar user already exist karta hai toh usko update karo
      if (!user.googleId) {
        user.googleId = googleId;
        user.provider = 'google';
        if (picture && !user.avatarUrl) {
          user.avatarUrl = picture;
        }
        await user.save();
      }
    } else {
      // ==========================================
      // 🔥 NEW CONCURRENCY-SAFE LOGIC (Try -> Catch -> Retry)
      // ==========================================
      const MAX_RETRIES = 10;
      let suffix = 0;

      // Base username banao (e.g. "John Doe" -> "johndoe")
      let baseUsername = name ? name.replace(/\s+/g, '').toLowerCase() : email.split('@')[0];
      let userCreated = false;

      // Loop tab tak chalega jab tak user create na ho jaye, ya max retries khatam na ho jayein
      while (!userCreated && suffix <= MAX_RETRIES) {
        // Final username decide karo (suffix 0 par sirf base name, warna suffix laga do)
        const username = suffix === 0 ? baseUsername : `${baseUsername}${suffix}`;

        try {
          // 🔥 IMPORTANT: Direct CREATE attempt karo. Pehle Check (find) mat karo!
          user = await User.create({
            username,
            email,
            googleId,
            avatarUrl: picture,
            provider: 'google',
          });
          userCreated = true; // Success! Loop break ho jayega

        } catch (err) {
          // Agar error MongoDB ka Duplicate Key (Error Code 11000) hai
          if (err.code === 11000 && err.keyPattern?.username) {
            suffix++; // Suffix badhao aur dobara loop chalao (Retry)
            console.log(`⚠️ Username collision for ${username}. Retrying with ${baseUsername}${suffix}`);
          } else {
            throw err; // Agar koi aur error hai (DB connection failure etc.), toh usko throw kar do
          }
        }
      }

      // Agar 10 baar retry ke baad bhi fail ho jaye
      if (!userCreated) {
        throw new Error(`Failed to generate unique username for ${baseUsername} after ${MAX_RETRIES} attempts.`);
      }
      // ==========================================
    }

    const token = generateToken(user._id);

    res.json({
      message: 'Login successful!',
      ...buildAuthResponse(user, token),
    });
  } catch (err) {
    console.error('Google Auth Error:', err);
    res.status(400).json({ error: 'Invalid Google token or authentication failed.' });
  }
};
const updateAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const metadata = await sharp(req.file.buffer).metadata();
    const MIN_DIMENSION = 100;  // Minimum 100x100 pixels
    const MAX_DIMENSION = 4096; // Maximum 4096x4096 pixels (4K)

    if (!metadata.width || !metadata.height) {
      return res.status(400).json({ error: 'Unable to read image metadata. File might be corrupted.' });
    }

    if (metadata.width < MIN_DIMENSION || metadata.height < MIN_DIMENSION) {
      return res.status(400).json({
        error: `Avatar image is too small. Minimum allowed dimensions are ${MIN_DIMENSION}x${MIN_DIMENSION} pixels.`
      });
    }

    if (metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION) {
      return res.status(400).json({
        error: `Avatar image is too large. Maximum allowed dimensions are ${MAX_DIMENSION}x${MAX_DIMENSION} pixels.`
      });
    }
    // ==========================================

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
<<<<<<< Updated upstream
      { id: user._id, email: user.email },
      secret,
=======
      { id: user._id, email: user.email }, 
      secret, 
>>>>>>> Stashed changes
      { expiresIn: process.env.PASSWORD_RESET_TOKEN_EXPIRES || '15m' }
    );

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    const resetLink = `${clientUrl}/reset-password/${user._id}/${token}`;

    const emailFrom = process.env.EMAIL_FROM || '"Spam Detection System" <noreply@spamdetection.local>';

    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      // 🔥 UPDATED: Using the centralized transporter instead of creating a new one
      await emailTransporter.sendMail({
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

    // ==========================================
    // 🔥 NEW: EXPLICITLY INVALIDATE RESET TOKEN
    // (Single-use token policy)
    // ==========================================
    await BlacklistedToken.blacklist(
      token,
      user._id,
      'PASSWORD_RESET_USED',
      req.ip || req.connection?.remoteAddress,
      req.headers['user-agent']
    );
    // ==========================================

    res.json({ message: 'Password has been successfully reset. You can now login.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Server error. Please try again later.' });
  }
};

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

const getSessionStatus = async (req, res) => {
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

// ZERO TRUST - ROLE MANAGEMENT
// ============================================

// @desc    Assign role to user (Admin only)
// @route   POST /api/auth/admin/assign-role
const assignRole = async (req, res) => {
  try {
    const { userId, role } = req.body;

    if (!userId || !role) {
      return res.status(400).json({
        success: false,
        error: 'userId and role are required'
      });
    }

    const validRoles = ['user', 'moderator', 'admin'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        error: `Invalid role. Must be one of: ${validRoles.join(', ')}`
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Check if requester has permission
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required to assign roles'
      });
    }

    // Update user role (permissions auto-assigned via pre-save hook)
    user.role = role;
    await user.save();

    res.json({
      success: true,
      message: `Role '${role}' assigned successfully to ${user.email}`,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        role: user.role,
        permissions: user.permissions
      }
    });
  } catch (err) {
    console.error('Assign role error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to assign role'
    });
  }
};

// @desc    Get user's permissions (Admin only)
// @route   GET /api/auth/admin/user-permissions/:userId
const getUserPermissions = async (req, res) => {
  try {
    const { userId } = req.params;

    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    const user = await User.findById(userId).select('email username role permissions');
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        role: user.role,
        permissions: user.permissions
      }
    });
  } catch (err) {
    console.error('Get user permissions error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to get user permissions'
    });
  }
};

// @desc    Get all roles and permissions (Public)
// @route   GET /api/auth/roles
const getRolesAndPermissions = async (req, res) => {
  try {
    const roles = User.getRoles ? User.getRoles() : ['user', 'moderator', 'admin'];
    const permissions = User.getPermissions ? User.getPermissions() : [];

    res.json({
      success: true,
      roles: roles,
      permissions: permissions,
      rolePermissions: User.ROLE_PERMISSIONS || {}
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Failed to get roles and permissions'
    });
  }
};

// ============================================
// 📌 EXPORTS - ONLY ONCE AT THE VERY END

// EXPORTS

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
  assignRole,
  getUserPermissions,
  getRolesAndPermissions,
  generateToken,
  buildAuthResponse
<<<<<<< Updated upstream
};
=======
};

module.exports = { register, login, logout, getMe, googleLogin, updateAvatar, forgotPassword, resetPassword, updateWebhook };


  getSessionStatus
};

>>>>>>> Stashed changes
