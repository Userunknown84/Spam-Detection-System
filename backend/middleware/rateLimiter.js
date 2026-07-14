const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const redis = require('redis');

let redisClient = null;
let store = undefined;

if (process.env.REDIS_URL) {
  try {
    redisClient = redis.createClient({
      url: process.env.REDIS_URL,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.warn('⚠️  Redis connection failed, falling back to memory store');
            return false;
          }
          return Math.min(retries * 100, 3000);
        }
      }
    });

    redisClient.on('error', (err) => {
      console.warn('⚠️  Redis error:', err.message);
      store = undefined;
    });

    redisClient.connect().then(() => {
      console.log('✅ Redis connected for rate limiting');
      store = new RedisStore({
        sendCommand: (...args) => redisClient.sendCommand(args),
      });
    }).catch(() => {
      console.warn('⚠️  Redis connection failed, using memory store');
      store = undefined;
    });
  } catch (error) {
    console.warn('⚠️  Redis not available, using memory store');
    store = undefined;
  }
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  store: store,
  message: {
    success: false,
    message: 'Too many login attempts from this IP, please try again after 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    return req.body.email || ipKeyGenerator(req.ip || req.connection.remoteAddress);
  },
});

const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  store: store,
  message: {
    success: false,
    message: 'Too many registration attempts from this IP, please try again after 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  store: store,
  message: {
    success: false,
    message: 'Too many password reset requests, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.body.email || ipKeyGenerator(req.ip || req.connection.remoteAddress);
  },
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  store: store,
  message: {
    success: false,
    message: 'Too many API requests from this IP, please try again after 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  store: store,
  message: {
    success: false,
    error: "Too many chat requests. Please slow down."
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user?.id || ipKeyGenerator(req.ip || req.connection.remoteAddress);
  },
});

const PREDICT_WINDOW_MS =
  Number(process.env.RATE_LIMIT_WINDOW_MS) ||
  Number(process.env.PREDICT_RATE_LIMIT_WINDOW_MS) ||
  15 * 60 * 1000;

const PREDICT_MAX =
  Number(process.env.RATE_LIMIT_MAX) ||
  Number(process.env.PREDICT_RATE_LIMIT_MAX) ||
  100;

const predictLimiter = rateLimit({
  windowMs: PREDICT_WINDOW_MS,
  max: PREDICT_MAX,
  store: store,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user?.id || ipKeyGenerator(req.ip || req.connection.remoteAddress);
  },
  handler: (req, res, next, options) => {
    const retryAfterSeconds = Math.ceil(options.windowMs / 1000);

    res.setHeader("Retry-After", retryAfterSeconds);

    res.status(options.statusCode).json({
      success: false,
      error: "Too many prediction requests. Please try again later.",
      retryAfter: retryAfterSeconds,
      limit: options.max,
      remaining: 0,
      resetTime: new Date(Date.now() + options.windowMs).toISOString()
    });
  }
});

const otpLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 3,
  store: store,
  message: {
    success: false,
    error: 'Too many OTP requests. Please wait 5 minutes.',
    retryAfter: 5 * 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.body.email || req.body.phone || ipKeyGenerator(req.ip || req.connection.remoteAddress);
  },
  handler: (req, res, next, options) => {
    const retryAfterSeconds = Math.ceil(options.windowMs / 1000);
    res.status(429).json({
      success: false,
      error: 'Rate limit exceeded. Maximum 3 OTP requests per 5 minutes.',
      retryAfter: retryAfterSeconds,
      limit: options.max,
      remaining: 0,
      resetTime: new Date(Date.now() + options.windowMs).toISOString()
    });
  }
});

const verificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  store: store,
  message: {
    success: false,
    error: 'Too many verification attempts. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.body.email || req.body.phone || ipKeyGenerator(req.ip || req.connection.remoteAddress);
  },
  skipSuccessfulRequests: true,
  handler: (req, res, next, options) => {
    const retryAfterSeconds = Math.ceil(options.windowMs / 1000);
    res.status(429).json({
      success: false,
      error: 'Too many verification attempts. Please try again in 15 minutes.',
      retryAfter: retryAfterSeconds,
      limit: options.max,
      remaining: 0
    });
  }
});

const bulkPredictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  store: store,
  message: {
    success: false,
    error: 'Too many bulk prediction requests. Please wait 1 hour.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user?.id || ipKeyGenerator(req.ip || req.connection.remoteAddress);
  },
});

const exportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  store: store,
  message: {
    success: false,
    error: 'Too many export requests. Please wait 1 hour.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user?.id || ipKeyGenerator(req.ip || req.connection.remoteAddress);
  },
});

const feedbackLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  store: store,
  message: {
    success: false,
    error: 'Too many feedback submissions. Please slow down.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user?.id || ipKeyGenerator(req.ip || req.connection.remoteAddress);
  },
});

const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development';

const getLimiterConfig = (baseConfig) => {
  if (isDevelopment) {
    return {
      ...baseConfig,
      max: baseConfig.max * 2,
      windowMs: baseConfig.windowMs / 2,
    };
  }
  return baseConfig;
};

module.exports = {
  loginLimiter,
  registerLimiter,
  resetLimiter,
  apiLimiter,
  chatLimiter,
  predictLimiter,
  bulkPredictLimiter,
  exportLimiter,
  feedbackLimiter,

  // OTP limiters
  otpLimiter,
  verificationLimiter,
  PREDICT_MAX,
  PREDICT_WINDOW_MS,
  redisClient
};
