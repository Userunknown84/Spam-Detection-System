const jwt = require('jsonwebtoken');
const User = require('../models/User');
const BlacklistedToken = require('../models/BlacklistedToken');

/**
 * Protect middleware - Verifies JWT and checks blacklist
 */
const protect = async (req, res, next) => {
  let token;

  // 1. Extract token from Authorization header
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  // 2. Check if token exists
  if (!token) {
    return res.status(401).json({ 
      success: false,
      error: 'Not authorized, no token provided' 
    });
  }

  try {
    // 3. 🛡️ Check if token is blacklisted
    const isBlacklisted = await BlacklistedToken.findOne({ token });
    if (isBlacklisted) {
      return res.status(401).json({ 
        success: false,
        error: 'Not authorized, token has been revoked. Please login again.',
        reason: isBlacklisted.reason,
        revokedAt: isBlacklisted.createdAt
      });
    }

    // 4. Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // 5. Check if user still exists
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({ 
        success: false,
        error: 'User no longer exists' 
      });
    }

    // 6. Check if user is active (optional)
    if (user.status && user.status === 'inactive') {
      return res.status(403).json({ 
        success: false,
        error: 'Account is deactivated' 
      });
    }

    // 7. Attach user and token to request
    req.user = user;
    req.token = token;
    req.tokenDecoded = decoded;
    
    next();
  } catch (error) {
    console.error('Auth Middleware Error:', error);

    // Handle specific JWT errors
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false,
        error: 'Token expired. Please login again.',
        code: 'TOKEN_EXPIRED'
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid token. Please login again.',
        code: 'INVALID_TOKEN'
      });
    }

    res.status(401).json({ 
      success: false,
      error: 'Not authorized, token verification failed' 
    });
  }
};

/**
 * Optional: Admin middleware - Checks if user has admin role
 */
const admin = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      success: false,
      error: 'Not authenticated' 
    });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({ 
      success: false,
      error: 'Admin access required' 
    });
  }

  next();
};

/**
 * Optional: Role-based middleware
 * Usage: restrictTo('admin', 'moderator')
 */
const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false,
        error: 'Not authenticated' 
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        success: false,
        error: `Access denied. Required role: ${roles.join(' or ')}` 
      });
    }

    next();
  };
};

/**
 * Optional: Check if token can be refreshed
 */
const canRefreshToken = async (req, res, next) => {
  const token = req.token;
  
  if (!token) {
    return res.status(401).json({ 
      success: false,
      error: 'No token provided for refresh' 
    });
  }

  try {
    // Check if token is blacklisted
    const isBlacklisted = await BlacklistedToken.findOne({ token });
    if (isBlacklisted) {
      return res.status(401).json({ 
        success: false,
        error: 'Token revoked. Please login again.' 
      });
    }

    // Decode token to check expiration
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.exp) {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid token format' 
      });
    }

    // Check if token is expired
    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp < now) {
      return res.status(401).json({ 
        success: false,
        error: 'Token expired. Please login again.' 
      });
    }

    // Check if token is about to expire (within 5 minutes)
    const timeUntilExpiry = decoded.exp - now;
    req.tokenExpiringSoon = timeUntilExpiry < 300; // 5 minutes
    
    next();
  } catch (error) {
    res.status(401).json({ 
      success: false,
      error: 'Token refresh check failed' 
    });
  }
};

/**
 * Optional: Device fingerprinting helper
 */
const deviceFingerprint = (req) => {
  return {
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.headers['user-agent'],
    platform: req.headers['sec-ch-ua-platform'] || 'unknown',
    language: req.headers['accept-language']
  };
};

module.exports = { 
  protect, 
  admin, 
  restrictTo, 
  canRefreshToken,
  deviceFingerprint
};