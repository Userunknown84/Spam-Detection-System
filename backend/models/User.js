const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// ============================================
// ROLES & PERMISSIONS DEFINITIONS
// ============================================

const ROLES = {
  USER: 'user',
  MODERATOR: 'moderator',
  ADMIN: 'admin'
};

const PERMISSIONS = {
<<<<<<< Updated upstream
=======
  // User permissions
>>>>>>> Stashed changes
  PREDICT: 'predict',
  BULK_PREDICT: 'bulk_predict',
  VIEW_ANALYTICS: 'view_analytics',
  MANAGE_WEBHOOKS: 'manage_webhooks',
  EXPORT_DATA: 'export_data',
<<<<<<< Updated upstream
  MANAGE_USERS: 'manage_users',
  VIEW_REPORTS: 'view_reports',
=======
  
  // Moderator permissions
  MANAGE_USERS: 'manage_users',
  VIEW_REPORTS: 'view_reports',
  
  // Admin permissions
>>>>>>> Stashed changes
  MANAGE_ROLES: 'manage_roles',
  VIEW_LOGS: 'view_logs',
  SYSTEM_CONFIG: 'system_config',
  MANAGE_ALL: 'manage_all'
};

<<<<<<< Updated upstream
=======
// Role to permissions mapping
>>>>>>> Stashed changes
const ROLE_PERMISSIONS = {
  [ROLES.USER]: [
    PERMISSIONS.PREDICT,
    PERMISSIONS.BULK_PREDICT,
    PERMISSIONS.VIEW_ANALYTICS,
    PERMISSIONS.MANAGE_WEBHOOKS,
    PERMISSIONS.EXPORT_DATA
  ],
  [ROLES.MODERATOR]: [
    PERMISSIONS.PREDICT,
    PERMISSIONS.BULK_PREDICT,
    PERMISSIONS.VIEW_ANALYTICS,
    PERMISSIONS.MANAGE_WEBHOOKS,
    PERMISSIONS.EXPORT_DATA,
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.VIEW_REPORTS
  ],
  [ROLES.ADMIN]: [
    PERMISSIONS.PREDICT,
    PERMISSIONS.BULK_PREDICT,
    PERMISSIONS.VIEW_ANALYTICS,
    PERMISSIONS.MANAGE_WEBHOOKS,
    PERMISSIONS.EXPORT_DATA,
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.MANAGE_ROLES,
    PERMISSIONS.VIEW_LOGS,
    PERMISSIONS.SYSTEM_CONFIG,
    PERMISSIONS.MANAGE_ALL
  ]
};

// ============================================
// USER SCHEMA
// ============================================

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, 'Username is required'],
      trim: true,
<<<<<<< Updated upstream
      minlength: [3, 'Username must be at least 3 characters long'],
      maxlength: [30, 'Username cannot exceed 30 characters'],
      match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores']
=======

      minlength: 3,
      maxlength: 30,
      match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores']

      minlength: [3, 'Username must be at least 3 characters long'],
      maxlength: [30, 'Username cannot exceed 30 characters'],

>>>>>>> Stashed changes
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
    },
    password: {
      type: String,
<<<<<<< Updated upstream
      required: false,
      minlength: [6, 'Password must be at least 6 characters long'],
      select: false
=======

      required: function() {
        return this.provider === 'local';
      },
      minlength: 6,
      select: false // Don't return password by default

      required: false,

      minlength: [6, 'Password must be at least 6 characters long'],


>>>>>>> Stashed changes
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true
    },
    avatarUrl: {
      type: String,
      default: null
    },
    provider: {
      type: String,
<<<<<<< Updated upstream
      enum: {
        values: ['local', 'google'],
        message: '{VALUE} is not a valid provider'
      },
      default: 'local'
    },
    role: {
      type: String,
      enum: Object.values(ROLES),
      default: ROLES.USER
    },
    permissions: {
      type: [String],
      enum: Object.values(PERMISSIONS),
      default: ROLE_PERMISSIONS[ROLES.USER]
    },
=======

      enum: ['local', 'google'],
      default: 'local'
    },
    // ============================================
    // ROLE & PERMISSIONS (Zero Trust)
    // ============================================
    role: {
      type: String,
      enum: Object.values(ROLES),
      default: ROLES.USER
    },
    permissions: {
      type: [String],
      enum: Object.values(PERMISSIONS),
      default: ROLE_PERMISSIONS[ROLES.USER]

      enum: {
        values: ['local', 'google'],
        message: '{VALUE} is not a valid provider'
      },
      default: 'local',

    },
    // ============================================
    // WEBHOOK URL (Existing)
    // ============================================
>>>>>>> Stashed changes
    webhookUrl: {
      type: String,
      trim: true,
      default: null,

      match: [/^https?:\/\/.+/, 'Please enter a valid HTTP or HTTPS URL']

      match: [/^https?:\/\/.+/, 'Please enter a valid HTTP or HTTPS URL'],
<<<<<<< Updated upstream
      maxlength: [2000, 'Webhook URL cannot exceed 2000 characters']
    },
=======
      maxlength: [2000, 'Webhook URL cannot exceed 2000 characters'],

    },
    // ============================================
    // ACCOUNT STATUS (Optional)
    // ============================================
>>>>>>> Stashed changes
    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended'],
      default: 'active'
    },
    lastLogin: {
      type: Date,
      default: null
    },
    loginAttempts: {
      type: Number,
      default: 0
    },
    lockUntil: {
      type: Date,
      default: null
    }
  },
  { 
    timestamps: true 
  }
);

// ============================================
<<<<<<< Updated upstream
// CASE-INSENSITIVE UNIQUE INDEXES
// ============================================

userSchema.index(
  { email: 1 },
  {
    unique: true,
    collation: {
      locale: 'en',
      strength: 2
    },
    name: 'email_case_insensitive_unique'
  }
);

userSchema.index(
  { username: 1 },
  {
    unique: true,
    collation: {
      locale: 'en',
      strength: 2
    },
    name: 'username_case_insensitive_unique'
  }
);

userSchema.index({ role: 1 });
userSchema.index({ status: 1 });
userSchema.index({ googleId: 1 });
=======
// INDEXES
// ============================================

userSchema.index({ email: 1 });
userSchema.index({ username: 1 });
userSchema.index({ role: 1 });
userSchema.index({ status: 1 });
>>>>>>> Stashed changes

// ============================================
// PRE-SAVE HOOKS
// ============================================

<<<<<<< Updated upstream
=======
// Hash password before saving
>>>>>>> Stashed changes
userSchema.pre('save', async function (next) {
  if (!this.password || !this.isModified('password')) {
    return next();
  }
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

<<<<<<< Updated upstream
=======
// Set default permissions based on role
>>>>>>> Stashed changes
userSchema.pre('save', function (next) {
  if (this.isModified('role') || this.isNew) {
    this.permissions = ROLE_PERMISSIONS[this.role] || ROLE_PERMISSIONS[ROLES.USER];
  }
  next();
});

// ============================================
// INSTANCE METHODS
// ============================================

<<<<<<< Updated upstream
=======
// Compare password
>>>>>>> Stashed changes
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

<<<<<<< Updated upstream
=======
// Check if user has specific permission
>>>>>>> Stashed changes
userSchema.methods.hasPermission = function (permission) {
  if (this.role === ROLES.ADMIN) return true;
  return this.permissions.includes(permission);
};

<<<<<<< Updated upstream
=======
// Check if user has all required permissions
>>>>>>> Stashed changes
userSchema.methods.hasAllPermissions = function (requiredPermissions) {
  if (this.role === ROLES.ADMIN) return true;
  return requiredPermissions.every(p => this.permissions.includes(p));
};

<<<<<<< Updated upstream
=======
// Update last login
>>>>>>> Stashed changes
userSchema.methods.updateLastLogin = function () {
  this.lastLogin = new Date();
  this.loginAttempts = 0;
  this.lockUntil = null;
  return this.save();
};

<<<<<<< Updated upstream
userSchema.methods.incrementLoginAttempts = function () {
  this.loginAttempts += 1;
  if (this.loginAttempts >= 5) {
    this.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
=======
// Increment login attempts
userSchema.methods.incrementLoginAttempts = function () {
  this.loginAttempts += 1;
  if (this.loginAttempts >= 5) {
    this.lockUntil = new Date(Date.now() + 15 * 60 * 1000); // Lock for 15 minutes
>>>>>>> Stashed changes
  }
  return this.save();
};

<<<<<<< Updated upstream
=======
// Check if account is locked
>>>>>>> Stashed changes
userSchema.methods.isLocked = function () {
  if (!this.lockUntil) return false;
  return this.lockUntil > new Date();
};

// ============================================
// STATIC METHODS
// ============================================

<<<<<<< Updated upstream
=======
// Get permissions for a role
>>>>>>> Stashed changes
userSchema.statics.getPermissionsForRole = function (role) {
  return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS[ROLES.USER];
};

<<<<<<< Updated upstream
=======
// Get all available roles
>>>>>>> Stashed changes
userSchema.statics.getRoles = function () {
  return Object.values(ROLES);
};

<<<<<<< Updated upstream
=======
// Get all available permissions
>>>>>>> Stashed changes
userSchema.statics.getPermissions = function () {
  return Object.values(PERMISSIONS);
};

// ============================================
// VIRTUAL PROPERTIES
// ============================================

<<<<<<< Updated upstream
=======
// Check if user is admin
>>>>>>> Stashed changes
userSchema.virtual('isAdmin').get(function () {
  return this.role === ROLES.ADMIN;
});

<<<<<<< Updated upstream
=======
// Check if user is moderator
>>>>>>> Stashed changes
userSchema.virtual('isModerator').get(function () {
  return this.role === ROLES.MODERATOR || this.role === ROLES.ADMIN;
});

// ============================================
// EXPORTS
// ============================================

<<<<<<< Updated upstream
=======
// Export constants for use in other files
>>>>>>> Stashed changes
userSchema.statics.ROLES = ROLES;
userSchema.statics.PERMISSIONS = PERMISSIONS;
userSchema.statics.ROLE_PERMISSIONS = ROLE_PERMISSIONS;

module.exports = mongoose.model('User', userSchema);