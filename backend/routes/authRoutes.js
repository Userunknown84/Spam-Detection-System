const express = require('express');
const router = express.Router();

const { body } = require('express-validator');
const { 
  register, 
  login, 
  logout,               // ✅ Import logout
  getMe, 
  googleLogin, 
  updateAvatar, 
  forgotPassword, 
  resetPassword, 
  updateWebhook,
  requestOTP,
  verifyOTP,
  getOTPStatus,
  changePassword,       // ✅ Import changePassword
  getSessionStatus      // ✅ Import session status
} = require('../controllers/authController');

const { registerValidation,loginValidation,forgotPasswordValidation,resetPasswordValidation} = require("../validators/auth.validator");
// ---> NEW: Added updateWebhook to imports
const { register, login, getMe, googleLogin, updateAvatar, forgotPassword, resetPassword, updateWebhook } = require('../controllers/authController');

const { protect } = require('../middleware/authMiddleware');
const { 
  registerLimiter, 
  loginLimiter, 
  resetLimiter,
  otpLimiter,
  verificationLimiter,
  apiLimiter
} = require('../middleware/rateLimiter');
const multer = require('multer');
const path = require('path');
const jwt = require('jsonwebtoken');   // ✅ Add for refresh token
const User = require('../models/User'); // ✅ Add for account delete

// ============================================
// MULTER CONFIGURATION FOR AVATAR UPLOAD
// ============================================
const storage = multer.memoryStorage();
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'), false);
  }
};
const upload = multer({ 
  storage, 
  fileFilter,
  limits: { 
    fileSize: 2 * 1024 * 1024,
    files: 1
  }
});

const { handleAvatarUpload } = require('../middleware/avatarUpload');


// ============================================
// VALIDATION MIDDLEWARE
// ============================================

/**
 * Registration Validation Rules
 */
const registerValidation = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be 3–30 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),
  body('email')
    .isEmail()
    .withMessage('Please enter a valid email')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters')
    .matches(/^(?=.*[A-Za-z])(?=.*\d)/)
    .withMessage('Password must contain at least one letter and one number'),
  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Passwords do not match');
      }
      return true;
    })
];

/**
 * Login Validation Rules
 */
const loginValidation = [
  body('email')
    .isEmail()
    .withMessage('Please enter a valid email')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
];

/**
 * Forgot Password Validation Rules
 */
const forgotPasswordValidation = [
  body('email')
    .isEmail()
    .withMessage('Please enter a valid email')
    .normalizeEmail(),
];

/**
 * Reset Password Validation Rules
 */
const resetPasswordValidation = [
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters')
    .matches(/^(?=.*[A-Za-z])(?=.*\d)/)
    .withMessage('Password must contain at least one letter and one number'),
  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Passwords do not match');
      }
      return true;
    })
];


router.post('/login', loginValidation, loginLimiter, login);
router.post('/register', registerValidation, registerLimiter, register);
router.post('/google', loginLimiter, googleLogin);
router.get('/me', protect, getMe);
router.post('/avatar', protect, handleAvatarUpload, updateAvatar);

// ---> NEW: Webhook Settings Route (Protected)
router.put('/webhook', protect, updateWebhook);


/**
 * Change Password Validation Rules
 */
const changePasswordValidation = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters')
    .matches(/^(?=.*[A-Za-z])(?=.*\d)/)
    .withMessage('Password must contain at least one letter and one number'),
  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Passwords do not match');
      }
      return true;
    })
];

/**
 * OTP Request Validation Rules
 */
const otpRequestValidation = [
  body('email')
    .optional()
    .isEmail()
    .withMessage('Please enter a valid email')
    .normalizeEmail(),
  body('phone')
    .optional()
    .matches(/^\+?[1-9]\d{1,14}$/)
    .withMessage('Please enter a valid phone number (E.164 format)'),
  body('type')
    .optional()
    .isIn(['email', 'sms'])
    .withMessage('Type must be either "email" or "sms"'),
  body().custom((value) => {
    if (!value.email && !value.phone) {
      throw new Error('Either email or phone number is required');
    }
    return true;
  })
];

/**
 * OTP Verification Validation Rules
 */
const otpVerificationValidation = [
  body('email')
    .optional()
    .isEmail()
    .withMessage('Please enter a valid email')
    .normalizeEmail(),
  body('phone')
    .optional()
    .matches(/^\+?[1-9]\d{1,14}$/)
    .withMessage('Please enter a valid phone number (E.164 format)'),
  body('otp')
    .isLength({ min: 6, max: 6 })
    .withMessage('OTP must be exactly 6 digits')
    .matches(/^\d{6}$/)
    .withMessage('OTP must contain only digits'),
  body().custom((value) => {
    if (!value.email && !value.phone) {
      throw new Error('Either email or phone number is required');
    }
    return true;
  })
];

/**
 * Webhook Update Validation
 */
const webhookValidation = [
  body('url')
    .optional()
    .isURL()
    .withMessage('Please enter a valid URL'),
  body('events')
    .optional()
    .isArray()
    .withMessage('Events must be an array')
    .custom((value) => {
      const validEvents = ['prediction', 'feedback', 'user_activity'];
      return value.every(event => validEvents.includes(event));
    })
    .withMessage('Invalid event type'),
];

// ============================================
// AUTH ROUTES
// ============================================

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post(
  '/register', 
  registerValidation, 
  registerLimiter, 
  register
);

/**
 * @route   POST /api/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post(
  '/login', 
  loginValidation, 
  loginLimiter, 
  login
);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user - blacklist token
 * @access  Private
 */
router.post(
  '/logout',
  protect,
  apiLimiter,
  logout
);

/**
 * @route   POST /api/auth/google
 * @desc    Google OAuth login
 * @access  Public
 */
router.post(
  '/google', 
  loginLimiter, 
  googleLogin
);

/**
 * @route   GET /api/auth/me
 * @desc    Get current user profile
 * @access  Private
 */
router.get(
  '/me', 
  protect, 
  getMe
);

/**
 * @route   POST /api/auth/avatar
 * @desc    Update user avatar
 * @access  Private
 */
router.post(
  '/avatar', 
  protect, 
  upload.single('avatar'),
  handleAvatarUpload, 
  updateAvatar
);

/**
 * @route   PUT /api/auth/webhook
 * @desc    Update webhook settings
 * @access  Private
 */
router.put(
  '/webhook', 
  protect, 
  webhookValidation,
  apiLimiter,
  updateWebhook
);

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Request password reset
 * @access  Public
 */
router.post(
  '/forgot-password', 
  resetLimiter, 
  forgotPasswordValidation, 
  forgotPassword
);

/**
 * @route   POST /api/auth/reset-password/:id/:token
 * @desc    Reset password with token
 * @access  Public
 */
router.post(
  '/reset-password/:id/:token', 
  resetLimiter, 
  resetPasswordValidation, 
  resetPassword
);

/**
 * @route   POST /api/auth/change-password
 * @desc    Change user password (authenticated)
 * @access  Private
 */
router.post(
  '/change-password',
  protect,
  loginLimiter,
  changePasswordValidation,
  changePassword
);

// ============================================
// OTP ROUTES
// ============================================

/**
 * @route   POST /api/auth/request-otp
 * @desc    Request OTP for verification
 * @access  Public
 */
router.post(
  '/request-otp',
  otpRequestValidation,
  otpLimiter,
  requestOTP
);

/**
 * @route   POST /api/auth/verify-otp
 * @desc    Verify OTP
 * @access  Public
 */
router.post(
  '/verify-otp',
  otpVerificationValidation,
  verificationLimiter,
  verifyOTP
);

/**
 * @route   GET /api/auth/otp-status
 * @desc    Get OTP status for a user
 * @access  Public
 */
router.get(
  '/otp-status',
  apiLimiter,
  getOTPStatus
);

// ============================================
// SESSION MANAGEMENT ROUTES
// ============================================

/**
 * @route   GET /api/auth/session-status
 * @desc    Get current session status
 * @access  Private
 */
router.get(
  '/session-status',
  protect,
  apiLimiter,
  getSessionStatus
);

/**
 * @route   POST /api/auth/refresh-token
 * @desc    Refresh JWT token
 * @access  Private
 */
router.post(
  '/refresh-token',
  protect,
  apiLimiter,
  async (req, res) => {
    try {
      const newToken = jwt.sign(
        { id: req.user._id, email: req.user.email },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );
      
      res.json({
        success: true,
        token: newToken,
        message: 'Token refreshed successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Token refresh failed',
        error: error.message
      });
    }
  }
);

// ============================================
// ACCOUNT MANAGEMENT ROUTES
// ============================================

/**
 * @route   DELETE /api/auth/account
 * @desc    Delete user account
 * @access  Private
 */
router.delete(
  '/account',
  protect,
  apiLimiter,
  async (req, res) => {
    try {
      const BlacklistedToken = require('../models/BlacklistedToken');
      
      // Delete user
      await User.findByIdAndDelete(req.user._id);
      
      // Invalidate all tokens
      await BlacklistedToken.invalidateAllUserTokens(
        req.user._id,
        'ADMIN_REVOKE',
        req.token,
        req.ip || req.connection?.remoteAddress,
        req.headers['user-agent']
      );
      
      res.json({
        success: true,
        message: 'Account deleted successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Account deletion failed',
        error: error.message
      });
    }
  }
);

// ============================================
// RATE LIMIT STATUS ROUTE
// ============================================

/**
 * @route   GET /api/auth/rate-limit-status
 * @desc    Get current rate limit status
 * @access  Public
 */
router.get(
  '/rate-limit-status',
  apiLimiter,
  async (req, res) => {
    try {
      res.json({
        success: true,
        data: {
          limits: {
            login: { window: '15 minutes', max: 5 },
            register: { window: '15 minutes', max: 5 },
            reset: { window: '15 minutes', max: 3 },
            otp: { window: '5 minutes', max: 3 },
            verification: { window: '15 minutes', max: 5 },
            api: { window: '15 minutes', max: 100 }
          }
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to get rate limit status',
        error: error.message
      });
    }
  }
);

module.exports = router;