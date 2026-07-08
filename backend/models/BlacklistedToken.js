const mongoose = require('mongoose');

const BlacklistedTokenSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: 0 } // Auto-delete after expiration
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  reason: {
    type: String,
    enum: ['LOGOUT', 'PASSWORD_CHANGE', 'ADMIN_REVOKE'],
    required: true,
    default: 'LOGOUT'
  },
  ipAddress: {
    type: String,
    default: null
  },
  userAgent: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Compound index for faster queries
BlacklistedTokenSchema.index({ userId: 1, createdAt: -1 });

// Method to check if token is blacklisted
BlacklistedTokenSchema.statics.isBlacklisted = async function(token) {
  const blacklisted = await this.findOne({ token });
  return !!blacklisted;
};

// Method to blacklist token
BlacklistedTokenSchema.statics.blacklist = async function(token, userId, reason, ipAddress, userAgent) {
  // Decode token to get expiration
  const jwt = require('jsonwebtoken');
  const decoded = jwt.decode(token);
  
  if (!decoded || !decoded.exp) {
    throw new Error('Invalid token: cannot determine expiration');
  }

  return this.create({
    token,
    expiresAt: new Date(decoded.exp * 1000),
    userId,
    reason: reason || 'LOGOUT',
    ipAddress: ipAddress || null,
    userAgent: userAgent || null
  });
};

// Method to invalidate all tokens for a user
BlacklistedTokenSchema.statics.invalidateAllUserTokens = async function(userId, reason, currentToken, ipAddress, userAgent) {
  // Delete all existing blacklisted tokens for this user
  await this.deleteMany({ userId });
  
  // Blacklist current token if provided
  if (currentToken) {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.decode(currentToken);
    
    if (decoded && decoded.exp) {
      await this.create({
        token: currentToken,
        expiresAt: new Date(decoded.exp * 1000),
        userId,
        reason: reason || 'PASSWORD_CHANGE',
        ipAddress: ipAddress || null,
        userAgent: userAgent || null
      });
    }
  }
};

module.exports = mongoose.model('BlacklistedToken', BlacklistedTokenSchema);