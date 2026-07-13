const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer();

const {
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
} = require('../controllers/authController');

const {
  registerValidation,
  loginValidation,
  forgotPasswordValidation,
  resetPasswordValidation,
} = require('../validators/auth.validator');

const { protect } = require('../middleware/authMiddleware');
const {
  registerLimiter,
  loginLimiter,
  resetLimiter,
  apiLimiter,
} = require('../middleware/rateLimiter');

// @desc    Register user
// @route   POST /api/auth/register
router.post('/register', registerLimiter, registerValidation, register);

// @desc    Login user
// @route   POST /api/auth/login
router.post('/login', loginLimiter, loginValidation, login);

// @desc    Logout user - Blacklist token
// @route   POST /api/auth/logout
router.post('/logout', protect, logout);

// @desc    Get current user
// @route   GET /api/auth/me
router.get('/me', protect, getMe);

// @desc    Google OAuth login
// @route   POST /api/auth/google
router.post('/google', apiLimiter, googleLogin);

// @desc    Update user avatar
// @route   POST /api/auth/avatar
router.post('/avatar', protect, upload.single('avatar'), updateAvatar);

// @desc    Forgot password - Send reset link
// @route   POST /api/auth/forgot-password
router.post('/forgot-password', resetLimiter, forgotPasswordValidation, forgotPassword);

// @desc    Reset password
// @route   POST /api/auth/reset-password/:id/:token
router.post('/reset-password/:id/:token', resetLimiter, resetPasswordValidation, resetPassword);

// @desc    Change password (authenticated)
// @route   POST /api/auth/change-password
router.post('/change-password', protect, changePassword);

// @desc    Update webhook URL
// @route   PUT /api/auth/webhook
router.put('/webhook', protect, updateWebhook);

// @desc    Get user's session status
// @route   GET /api/auth/session-status
router.get('/session-status', protect, getSessionStatus);

// ============================================
// ZERO TRUST - ROLE MANAGEMENT
// ============================================

// @desc    Assign role to user (Admin only)
// @route   POST /api/auth/admin/assign-role
router.post('/admin/assign-role', protect, assignRole);

// @desc    Get user's permissions (Admin only)
// @route   GET /api/auth/admin/user-permissions/:userId
router.get('/admin/user-permissions/:userId', protect, getUserPermissions);

// @desc    Get all roles and permissions (Public)
// @route   GET /api/auth/roles
router.get('/roles', getRolesAndPermissions);

module.exports = router;
