/**
 * Cache Stampede (Thundering Herd) Prevention Middleware
 * Uses in-memory Promise deduplication.
 */
const pendingRequests = new Map();

const preventCacheStampede = (req, res, next) => {
    // We only want to deduplicate POST requests with a text body (like /predict)
    if (req.method !== 'POST' || !req.body.text) {
        return next();
    }

    // Generate a simple cache key based on the input text
    const text = req.body.text.trim();
    const crypto = require('crypto');
    const cacheKey = crypto.createHash('sha256').update(text).digest('hex');

    // If another request is currently fetching this exact same data, WAIT for its promise
    if (pendingRequests.has(cacheKey)) {
        console.log(`🛡️ [Cache Lock] Thundering herd prevented! Waiting for active request...`);
        
        pendingRequests.get(cacheKey)
            .then(cachedResponse => {
                return res.json(cachedResponse);
            })
            .catch(err => {
                return res.status(500).json({ error: "Upstream API failed during concurrent request" });
            });
        return; 
    }

    // If this is the FIRST request, create a new Promise
    let resolvePromise, rejectPromise;
    const requestPromise = new Promise((resolve, reject) => {
        resolvePromise = resolve;
        rejectPromise = reject;
    });

    // Store it in the map
    pendingRequests.set(cacheKey, requestPromise);

    // Hijack Express's res.json() to capture the data
    const originalJson = res.json.bind(res);
    
    res.json = (body) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
            resolvePromise(body);
        } else {
            rejectPromise(new Error("Request failed"));
        }
        
        pendingRequests.delete(cacheKey);
        return originalJson(body);
    };

    // Safety timeout (15 seconds)
    setTimeout(() => {
        if (pendingRequests.has(cacheKey)) {
            pendingRequests.delete(cacheKey);
            rejectPromise(new Error("Cache lock timeout"));
        }
    }, 15000);

    next();
};

module.exports = { preventCacheStampede };
const Redis = require('ioredis');
const crypto = require('crypto');

// 1. Initialize Redis Connection (with Graceful Fallback)
const redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: 1,
  retryStrategy(times) {
    if (times > 3) {
      console.warn('⚠️ Redis connection failed. Falling back to direct ML API calls.');
      return null; // Stop retrying after 3 attempts
    }
    return Math.min(times * 50, 2000);
  }
});

redisClient.on('error', (err) => {
  console.error('Redis Error:', err.message);
});

// 2. Fast SHA-256 Hashing for Input Text
const generateCacheKey = (text) => {
  return crypto.createHash('sha256').update(text).digest('hex');
};

// 3. Cache Checking Middleware
const checkCache = async (req, res, next) => {
  try {
    const { text } = req.body; // Assuming the input is passed as 'text' in the body
    if (!text) return next();

    const key = `spam_cache:${generateCacheKey(text)}`;

    // Only query if Redis is healthy to prevent request hangs
    if (redisClient.status === 'ready') {
      const cachedResult = await redisClient.get(key);
      if (cachedResult) {
        console.log('🚀 Cache Hit! Returning data from Redis.');
        return res.status(200).json(JSON.parse(cachedResult));
      }
    }
    
    // Cache Miss: Attach key to request so the controller can save it later
    req.cacheKey = key;
    next();
  } catch (error) {
    console.error('Cache Middleware Error:', error.message);
    next(); // Ensure the app doesn't crash, just proceed to Flask API
  }
};

// 4. Utility to Save to Cache
const setCache = async (key, data) => {
  try {
    if (redisClient.status === 'ready' && key) {
      // Set TTL to 24 hours (86400 seconds)
      await redisClient.set(key, JSON.stringify(data), 'EX', 86400);
    }
  } catch (error) {
    console.error('Redis Set Cache Error:', error.message);
  }
};

module.exports = { checkCache, setCache, redisClient, preventCacheStampede,generateCacheKey };

