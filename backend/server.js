const { checkCache, setCache } = require('./middleware/cacheMiddleware');
const { formatError, errorHandler, errorCodes, classifyMlApiError } = require('./utils/errorHelper');
require("dotenv").config();

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});
const dns = require("dns");
const validateEnv = require('./utils/validateEnv');
validateEnv(); // Validate environment variables
dns.setServers(["8.8.8.8", "1.1.1.1"]); // ensure SRV records resolve on all networks
const express = require("express");
const seedAdminUser = require("./seeders/adminSeeder");
const { getHealthStatus } = require('./utils/healthCheck');
const cors = require("cors");
const config = require('./config');
const compression = require('compression');
const { v4: uuidv4 } = require('uuid');
const helmet = require('helmet');
const axios = require("axios");
// Initialize background jobs
require('./jobs/archivalCron');
const { preventCacheStampede } = require('./middleware/cacheMiddleware');
const healthRoutes = require("./routes/healthRoutes");

// ===== STARTUP TIMER =====
const SERVER_START_TIME = Date.now();
const startupLogs = [];

const logStartupTime = (component, startTime) => {
  const elapsed = Date.now() - startTime;
  startupLogs.push({ component, elapsed });
  console.log(`⏱️ ${component} loaded in ${elapsed}ms`);
};

// Configure global request interceptor to append the internal secret API key
axios.interceptors.request.use(
  (config) => {
    config.timeout = 15000; // 15 seconds timeout
    // No hardcoded fallback: INTERNAL_SECRET is validated as mandatory at
    // startup (see utils/validateEnv.js), so it is guaranteed present here.
    config.headers["X-Internal-Secret"] = process.env.INTERNAL_SECRET;
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);
const mongoose = require("mongoose");

const History = require("./models/History");
const Rule = require("./models/Rule");
const User = require("./models/User");
const { matchKeywordRule } = require("./utils/keywordRules");

const multer = require("multer");
const displayBanner = require('./utils/banner');
const upload = multer();
const FormData = require("form-data");

const app = express();


// Apply standard throttling to the heavy ML prediction route
const { apiLimiter } = require('./middleware/rateLimiter');
app.use('/predict', apiLimiter);

// Trust the first proxy so express-rate-limit correctly identifies user IPs



const Sentry = require("@sentry/node");

// ====== SENTRY SETUP ======
let sentryEnabled = false;

if (process.env.SENTRY_DSN && process.env.SENTRY_DSN !== 'https://your-sentry-dsn@o123456.ingest.sentry.io/1234567') {
  const Sentry = require("@sentry/node");
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: 1.0,
  });
  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.tracingHandler());
  sentryEnabled = true;
  console.log('✅ Sentry initialized');

  // Make Sentry available globally
  global.Sentry = Sentry;
} else {
  console.log('ℹ️ Sentry disabled (no valid DSN provided)');
  // Mock Sentry to prevent errors
  global.Sentry = {
    captureException: () => { },
    setUser: () => { },
    setTags: () => { },
    setExtra: () => { },
  };
}

// Connect to MongoDB WITH RETRY
const connectWithRetry = async (retries = 5, delay = 5000) => {
  console.log("Attempting to connect to MongoDB...");
  console.log('Max retries:', retries, 'Delay between retries (ms):', delay);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(config.mongodbUri);
      console.log(`✅ MongoDB connected successfully (attempt ${attempt})`);
      monitorConnectionPool();
      seedAdminUser();
      return true;
    } catch (err) {
      console.error(`❌ MongoDB connection attempt ${attempt} failed:`, err.message);

      if (attempt === retries) {
        console.error("Max retries reached. Exiting process.");
        console.error("Please check your MongoDB connection string and ensure the database is accessible.");
        console.error('1.MongoDB is running');
        console.error('2.MongoDB URI is correct in .env file');
        console.error('   3. Network connectivity\n');
        process.exit(1);
      }

      console.log(`⏳ Waiting ${delay / 1000}s before retry...\n`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

//MONGODB CONNECTION POOL MONITORING
const monitorConnectionPool = () => {
  const timer = setInterval(() => {
    try {
      const pool = mongoose.connection.client.topology.s.pool;
      if (pool) {
        const size = pool.size || 0;
        const available = pool.availableConnections || 0;
        const used = pool.usedCount || 0;
        const usagePercent = size > 0 ? (used / size) * 100 : 0;

        console.debug(`[DB Pool] Size: ${size}, Available: ${available}, Used: ${used} (${usagePercent}%)`);

        //Alert if usage exceeds 80%
        if (usagePercent > 80) {
          console.warn(`[DB Pool] ⚠️ High connection pool usage: ${usagePercent.toFixed(2)}%`);
        }
      }
    } catch (err) {
    }
  }, 60000); // every 60 seconds

  timer.unref(); // prevent this interval from blocking graceful shutdown
};




if (process.env.NODE_ENV === 'development') {
  //Log all queries in development mode
  mongoose.set('debug', true);
} else {
  // Log only slow queries in production mode
  const originalExec = mongoose.Query.prototype.exec;
  mongoose.Query.prototype.exec = async function () {
    const start = Date.now();
    const result = await originalExec.apply(this, arguments);
    const duration = Date.now() - start;

    if (duration > 100) { // Log queries taking longer than 100ms
      console.log(`🐢 [${new Date().toISOString()}] Slow Query (${duration}ms):`);
      console.log(`   Collection: ${this._collection.collectionName}`);
      console.log(`   Query:`, JSON.stringify(this._conditions));
    }

    return result;
  };
}

// Start connection with retry
connectWithRetry();

const corsOptions = {
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
};
app.use(cors(corsOptions));
app.use(helmet());
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use('/uploads', express.static('uploads'));

// ===== REQUEST ID MIDDLEWARE =====
app.use((req, res, next) => {
  // Generate a unique request ID
  const requestId = uuidv4().substring(0, 8); // Shorten the UUID for easier logging
  req.requestId = requestId;

  //Add to response headers
  res.setHeader('X-Request-ID', requestId);

  // Log the request with the request ID
  console.log(`[${requestId}] ${req.method} ${req.originalUrl}`);

  //Track time
  const startTime = Date.now();

  //Log when response is finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    console.log(`[${requestId}] ⬅️ ${req.method} ${req.originalUrl} completed in ${duration}ms (${res.statusCode})`);
  });

  next();
});

// Auth routes , History routes
const authRoutes = require("./routes/authRoutes");
const historyRoutes = require("./routes/historyRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const chatRoutes = require("./routes/chatRoutes");
const ruleRoutes = require("./routes/ruleRoutes");
const reportRoutes = require("./routes/reportRoutes");

// Versioned routes (v1)
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/history", historyRoutes);
app.use("/api/v1/analytics", analyticsRoutes);
app.use("/api/v1/chat", chatRoutes);
app.use("/api/v1/rules", ruleRoutes);
app.use("/api/v1/reports", reportRoutes);

// Keep old routes for backward compatibility
app.use("/api/auth", authRoutes);
app.use("/api/history", historyRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/chat", chatRoutes);
app.get("/health", healthRoutes);
app.use("/api/rules", ruleRoutes);
app.use("/api/reports", reportRoutes);

const { protect } = require("./middleware/authMiddleware");
const { predictLimiter } = require("./middleware/rateLimiter");

app.get("/", (req, res) => {
  res.send("Node backend running ");
});

// Health check endpoint (Advanced)

// ---> NEW: Asynchronous Webhook Dispatcher (For Issue #430 & SSRF fix)
const net = require('net');
const { error } = require('console');

const isSafeWebhookUrl = (webhookUrl) => {
  try {
    const parsed = new URL(webhookUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;

    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost') return false;

    if (net.isIP(host)) {
      if (host.startsWith('127.') || host.startsWith('10.') || host.startsWith('192.168.') || host.startsWith('169.254.')) return false;
      const parts = host.split('.');
      if (parts.length === 4) {
        const first = parseInt(parts[0], 10);
        const second = parseInt(parts[1], 10);
        if (first === 172 && second >= 16 && second <= 31) return false;
        if (first === 0) return false;
      }
      if (host === '::1' || host.startsWith('fe80:') || host.startsWith('fc00:') || host.startsWith('fd00:')) return false;
    }
    return true;
  } catch (e) {
    return false;
  }
};

const dispatchWebhook = async (userId, payload) => {
  try {
    const user = await User.findById(userId);
    if (user && user.webhookUrl) {
      if (!isSafeWebhookUrl(user.webhookUrl)) {
        console.warn(`[Webhook Blocked] SSRF protection prevented request to: ${user.webhookUrl}`);
        return;
      }

      console.log(`[Webhook] Dispatching threat alert to: ${user.webhookUrl}`);

      // Fire and forget (Asynchronous execution via Axios) with 10s timeout
      axios.post(user.webhookUrl, {
        event: 'high_risk_threat_detected',
        timestamp: new Date().toISOString(),
        threat_details: payload
      }, { timeout: 10000 }).catch(err => {
        // Resilience: Catch external server errors so our app doesn't crash
        console.error(`[Webhook Failed] Could not deliver to ${user.webhookUrl}:`, err.message);
      });
    }
  } catch (err) {
    console.error('[Webhook Error] Error fetching user for webhook:', err.message);
  }
};

// Protected: only authenticated users can predict
app.post(
  "/predict",
  predictLimiter,
  (req, res, next) => {
    const text = req.body.text;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        error: "Input text cannot be empty or whitespace only."
      });
    }
    next();
  },
  preventCacheStampede,
  protect,
  checkCache,
  async (req, res) => {
    try {
      console.log("Reached /predict");
      const { text, type, sender, confidence_threshold } = req.body;
      console.log("Received:", text, type, sender);

    // Check 1: fields must exist
    if (!text) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        error: validationMessages.textRequired
      });
    }

    if (!type) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        error: validationMessages.typeRequired
      });
    }

    // Check 2: must be strings
    if (typeof text !== "string" || typeof type !== "string") {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        error: "Text and type must be strings." });
    }

    if (sender !== undefined && typeof sender !== "string") {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        error: validationMessages.senderMustBeString
       });
    }

    // Check 3: must not be empty or only whitespace
    if (text.trim().length === 0) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Validation failed",
          error: validationMessages.textEmpty
});
    }

    // Check 4: validate type is one of the accepted values
    const allowedTypes = ["sms", "email", "url", "message"];
    if (!allowedTypes.includes(type.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        error: validationMessages.invalidType
      });
    }

    // Check 5: validate text length
    if (text.trim().length > 5000) {
      return res.status(413).json({
        success: false,
        message: "Payload too large",
        error: validationMessages.maxTextLength
      });
    }

    // Check Blacklist & Whitelist rules
    let checkPattern = sender ? sender.trim().toLowerCase() : "";
    if (!checkPattern && type.toLowerCase() === "email") {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (emailRegex.test(text.trim())) {
        checkPattern = text.trim().toLowerCase();
      }
    }

    if (checkPattern) {
      const emailParts = checkPattern.split('@');
      const domain = emailParts.length > 1 ? emailParts[1] : '';
      const possiblePatterns = [checkPattern];
      if (domain) {
        possiblePatterns.push(`@${domain}`);
        possiblePatterns.push(domain);
      }

      const rule = await Rule.findOne({
        user: req.user.id,
        ruleCategory: { $ne: 'keyword' },
        pattern: { $in: possiblePatterns }
      });

      if (rule) {
        const isSpam = rule.type === 'blacklist';
        const prediction = isSpam ? "spam" : "ham";

        // Save history for rule matches as well (best-effort)
        try {
          await History.create({
            user: req.user.id,
            query: text,
            prediction: prediction,
            type: type,
            confidence: 1.0,
          });
        } catch (historyError) {
          console.error("Failed to save history for rule match:", historyError.message);
        }

        console.log(`Rule match found (${rule.type}):`, checkPattern);
        const ruleResult = {
          input: text,
          prediction: prediction,
          result: prediction,
          confidence: 1.0,
          confidence_score: 100.0,
          decision_score: null,
          confidence_level: "high",
          level_color: isSpam ? "red" : "green",
          level_emoji: isSpam ? "🔴" : "🟢",
          rule_applied: rule.type
        };

        return res.json(ruleResult);
      }
    }

    // Check keyword/phrase rules against the message content before falling
    // back to the ML model. A whitelisted phrase overrides a spam-looking
    // message; a blacklisted phrase flags it as spam.
    const keywordRules = await Rule.find({
      user: req.user.id,
      ruleCategory: 'keyword',
    }).limit(1000).lean();

    const keywordMatch = matchKeywordRule(text, keywordRules);
    if (keywordMatch) {
      const isSpam = keywordMatch.type === 'blacklist';
      const prediction = isSpam ? "spam" : "ham";

      try {
        await History.create({
          user: req.user.id,
          query: text,
          prediction: prediction,
          type: type,
          confidence: 1.0,
        });
      } catch (historyError) {
        console.error("Failed to save history for keyword rule match:", historyError.message);
      }

      console.log(`Keyword rule match found (${keywordMatch.type}):`, keywordMatch.pattern);
      const kwResult = {
        input: text,
        prediction: prediction,
        result: prediction,
        confidence: 1.0,
        confidence_score: 100.0,
        decision_score: null,
        confidence_level: "high",
        level_color: isSpam ? "red" : "green",
        level_emoji: isSpam ? "🔴" : "🟢",
        rule_applied: keywordMatch.type,
      };

      return res.json(kwResult);
    }

    console.log("Calling Flask...");

    // Check ML Cache globally before calling Flask
    const cacheKey = `spam_cache:${require('crypto').createHash('sha256').update(text).digest('hex')}`;
    const { redisClient } = require("./middleware/cacheMiddleware");
    if (redisClient && redisClient.status === 'ready') {
      try {
        const cachedResult = await redisClient.get(cacheKey);
        if (cachedResult) {
          console.log('🚀 Cache Hit! Returning data from Redis.');
          return res.status(200).json(JSON.parse(cachedResult));
        }
      } catch (cacheErr) {
        console.error('Redis Get Cache Error:', cacheErr.message);
      }
    }

    let apiUrl =
      process.env.VITE_ML_API_URI ||
      process.env.API ||
      "http://localhost:5000/predict";
    // Ensure URL doesn't end with double /predict
    apiUrl = apiUrl.replace(/\/predict\/?$/, "").replace(/\/$/, "") + "/predict";

    console.time("ML_API_CALL");
    const response = await axios.post(
      apiUrl,
      {
        text: text.trim(),
        type: type.toLowerCase(),
        confidence_threshold: confidence_threshold
      },
      {
        headers: {
          "X-Forwarded-For": req.ip || req.connection.remoteAddress,
          "X-Request-ID": req.requestId // Forwarding the correlation ID
        },
        timeout: Number(process.env.ML_API_TIMEOUT_MS) || 15000
      }
    );
    console.timeEnd("ML_API_CALL");
    console.log("Flask responded:", response.data);

    // Save history automatically (best-effort)
    try {
      await History.create({
        user: req.user.id,
        query: text,
        prediction: response.data.prediction,
        type: type,
        confidence: response.data.confidence || response.data.probability,
      });
    } catch (historyError) {
      console.error(`[${req.requestId}] Failed to save history: ${historyError.message}`);
    }

    const finalResponse = response.data;
    if (typeof finalResponse.confidence === "number") {
      finalResponse.confidence = Math.round(finalResponse.confidence * 100) / 100;
    }

    setCache(cacheKey, finalResponse).catch(err => console.error("Cache Save Error:", err));

    // ---> NEW: Trigger Webhook if threat is high risk
    const predictionLabel = finalResponse.prediction ? finalResponse.prediction.toLowerCase() : '';
    const confidenceScore = finalResponse.confidence || 0;

    if (['spam', 'malicious', 'smishing', 'phishing'].includes(predictionLabel) || confidenceScore > 0.90) {
      dispatchWebhook(req.user.id, {
        input_text: text,
        type: type,
        prediction: predictionLabel,
        confidence: confidenceScore
      });
    }

    return res.json(finalResponse);
  } catch (error) {
    Sentry.captureException(error, {
      tags: {
        endpoint: '/predict',
        userId: req.user?.id || 'anonymous'
      },
      extra: {
        text: req.body?.text?.substring(0, 100),
        type: req.body?.type,
        errorMessage: error.message
      }
    });

    console.error(`[${req.requestId}]`, error.message);

    const { status, body } = classifyMlApiError(error);
    return res.status(status).json(body);
  }
});

// Protected: record user feedback on a prediction (forwarded to the ML API)
const ML_API_BASE = (
  process.env.API || "http://localhost:5000/predict"
).replace(/\/predict$/, "");

app.post("/feedback", protect, async (req, res) => {
  try {
    const { text, predicted_label, correct_label } = req.body;

    if (!text || !correct_label) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Validation failed",
          error: validationMessages.feedbackFieldsRequired
});
    }

    const response = await axios.post(`${ML_API_BASE}/feedback`, {
      text,
      predicted_label,
      correct_label,
    });

    res.status(response.status).json(response.data);
  } catch (error) {
    // Capture error in Sentry with context
    Sentry.captureException(error, {
      tags: {
        endpoint: '/feedback',
        userId: req.user?.id || 'anonymous'
      },
      extra: {
        text: text?.substring(0, 100), // Truncate for privacy
        predicted_label,
        correct_label
      }
    });

    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    console.error(`[${req.requestId}] Feedback error:`, error.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// Protected: analyze email headers for authenticity (forwarded to ML API)
app.post(
  "/analyze-email-header",
  protect,
  upload.single("file"),
  async (req, res) => {
    try {
      if (req.file) {
        // Check file size (2MB limit)
        if (req.file.size > 2 * 1024 * 1024) {
          return res
            .status(413)
            .json({
              success: false,
              message: "Payload too large",
              error: validationMessages.fileSizeExceeded });
        }

        const form = new FormData();
        form.append("file", req.file.buffer, {
          filename: req.file.originalname,
          contentType: req.file.mimetype,
        });

        const response = await axios.post(
          `${ML_API_BASE}/analyze-email-header`,
          form,
          {
            headers: {
              ...form.getHeaders(),
            },
          },
        );
        return res.json(response.data);
      } else {
        const { headers } = req.body;

        if (!headers) {
          return res.status(400).json({
            success: false,
            message: "Validation failed",
            error: validationMessages.emailHeadersRequired });
        }

        if (typeof headers !== "string") {
          return res
            .status(400)
            .json({
              success: false,
              message: "Validation failed",
              error: validationMessages.emailHeadersString
             });
        }

        if (headers.trim().length === 0) {
          return res
            .status(400)
            .json({
              success: false,
              message: "Validation failed",
              error: validationMessages.emailHeadersNotEmpty
             });
        }

        const response = await axios.post(
          `${ML_API_BASE}/analyze-email-header`,
          {
            headers: headers,
          },
        );
        return res.json(response.data);
      }
    } catch (error) {
      if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
        console.error("Flask ML API is unavailable:", error.message);
        return res.status(503).json({
          error:
            "Flask ML API is currently unavailable. Please try again later.",
        });
      }
      if (error.response) {
        return res.status(error.response.status).json(error.response.data);
      }
      console.error(error.message);
      res.status(500).json({ error: "Something went wrong" });
    }
  },
);

// Protected: Bulk prediction
app.post("/bulk-predict", predictLimiter, protect, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        error: validationMessages.fileRequired
       });
    }

    // Check file size
    if (req.file.size > 2 * 1024 * 1024) {
      return res.status(413).json({
        success: false,
        message: "Payload too large",
        error: validationMessages.fileSizeExceeded
       });
    }

    const form = new FormData();
    form.append("file", req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });

    const response = await axios.post(`${ML_API_BASE}/bulk-predict`, form, {
      headers: {
        ...form.getHeaders(),
      },
    });

    res.json(response.data);
  } catch (error) {
    //Capture error in Sentry 
    Sentry.captureException(error, {
      tags: {
        endpoint: '/bulk-predict',
        userId: req.user?.id || 'anonymous'
      },
      extra: {
        fileSize: req.file?.size,
        fileName: req.file?.originalname,
      }
    });
    if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
      console.error("Flask ML API is unavailable:", error.message);
      return res.status(503).json({
        error: "Flask ML API is currently unavailable. Please try again later.",
      });
    }
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    console.error(error.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// Protected: Export bulk predictions as CSV
app.post(
  "/bulk-predict/export",
  predictLimiter,
  protect,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      // Check file size
      if (req.file.size > 2 * 1024 * 1024) {
        return res
          .status(413)
          .json({ error: "File size exceeds limit of 2MB" });
      }

      const form = new FormData();
      form.append("file", req.file.buffer, {
        filename: req.file.originalname,
        contentType: req.file.mimetype,
      });

      const response = await axios.post(
        `${ML_API_BASE}/bulk-predict/export`,
        form,
        {
          headers: {
            ...form.getHeaders(),
          },
          responseType: "stream",
        },
      );

      res.setHeader(
        "Content-Type",
        response.headers["content-type"] || "text/csv",
      );
      if (response.headers["content-disposition"]) {
        res.setHeader(
          "Content-Disposition",
          response.headers["content-disposition"],
        );
      } else {
        res.setHeader(
          "Content-Disposition",
          'attachment; filename="bulk_spam_predictions.csv"',
        );
      }

      response.data.pipe(res);
    } catch (error) {
      if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
        console.error("Flask ML API is unavailable:", error.message);
        return res.status(503).json({
          error:
            "Flask ML API is currently unavailable. Please try again later.",
        });
      }
      if (error.response) {
        if (typeof error.response.data.pipe === "function") {
          res.status(error.response.status);
          error.response.data.pipe(res);
          return;
        }
        return res.status(error.response.status).json(error.response.data);
      }
      console.error(error.message);
      res.status(500).json({ error: "Something went wrong" });
    }
  },
);

// Protected: Get spam pattern insights & analytics (forwarded to ML API)
app.get("/spam-insights", protect, async (req, res) => {
  try {
    const limit = req.query.limit || 10;
    const category = req.query.category || "";

    const response = await axios.get(`${ML_API_BASE}/spam-insights`, {
      params: { limit, category },
    });

    res.json(response.data);
  } catch (error) {
    if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
      console.error("Flask ML API is unavailable:", error.message);
      return res.status(503).json({
        error: "Flask ML API is currently unavailable. Please try again later.",
      });
    }
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    console.error(error.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// Public: word frequency data for the spam word-cloud widget (forwarded to ML API)
app.get("/api/wordcloud", async (req, res) => {
  try {
    const response = await axios.get(`${ML_API_BASE}/api/wordcloud`);
    res.json(response.data);
  } catch (error) {
    if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
      console.error("Flask ML API is unavailable:", error.message);
      return res.status(503).json({
        error: "Flask ML API is currently unavailable. Please try again later.",
      });
    }
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    console.error(error.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// Public: get spam word of the day (forwarded to ML API)
app.get("/api/word-of-the-day", async (req, res) => {
  try {
    const response = await axios.get(`${ML_API_BASE}/api/word-of-the-day`);
    res.json(response.data);
  } catch (error) {
    if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
      console.error("Flask ML API is unavailable:", error.message);
      return res.status(503).json({
        error: "Flask ML API is currently unavailable. Please try again later.",
      });
    }
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    console.error(error.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// Public: global feature importance for the "Top Spam Indicators" widget (forwarded to ML API)
app.get("/importance", async (req, res) => {
  try {
    const response = await axios.get(`${ML_API_BASE}/importance`);
    res.json(response.data);
  } catch (error) {
    if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
      console.error("Flask ML API is unavailable:", error.message);
      return res.status(503).json({
        error: "Flask ML API is currently unavailable. Please try again later.",
      });
    }
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    console.error(error.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// Protected: Get Gmail auth URL
app.get("/gmail/auth-url", protect, async (req, res) => {
  try {
    const response = await axios.get(`${ML_API_BASE}/gmail/auth-url`, {
      params: req.query,
      headers: {
        "X-User-Username": req.user.username,
      },
    });
    res.json(response.data);
  } catch (error) {
    if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
      console.error("Flask ML API is unavailable:", error.message);
      return res.status(503).json({
        error: "Flask ML API is currently unavailable. Please try again later.",
      });
    }
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    console.error(error.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// Public: Handle Gmail OAuth redirect and forward code to frontend
app.get("/gmail/callback", async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) {
      return res.status(400).json({ error: "Authorization code is missing" });
    }
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/app?provider=gmail&code=${code}`);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// Protected: Exchange Gmail auth code for tokens
app.get("/gmail/connect", protect, async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) {
      return res.status(400).json({ error: "Authorization code is missing" });
    }
    const response = await axios.get(`${ML_API_BASE}/gmail/callback`, {
      params: { code },
      headers: {
        "X-User-Username": req.user.username,
      },
    });
    res.json(response.data);
  } catch (error) {
    if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
      console.error("Flask ML API is unavailable:", error.message);
      return res.status(503).json({
        error: "Flask ML API is currently unavailable. Please try again later.",
      });
    }
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    console.error(error.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});


// Protected: Get latest Gmail emails
app.get("/gmail/emails", protect, async (req, res) => {
  try {
    const response = await axios.get(`${ML_API_BASE}/gmail/emails`, {
      headers: {
        "X-User-Username": req.user.username,
      },
    });
    res.json(response.data);
  } catch (error) {
    if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
      console.error("Flask ML API is unavailable:", error.message);
      return res.status(503).json({
        error: "Flask ML API is currently unavailable. Please try again later.",
      });
    }
    if (error.response) {
      const status =
        error.response.status === 401 ? 400 : error.response.status;
      return res.status(status).json(error.response.data);
    }
    console.error(error.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// De-Spamification API
app.post('/api/despamify', protect, async (req, res) => {
  try {
    const { text, tone = 'neutral' } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }
    
    // Simple de-spamification logic
    let deSpammed = text;
    
    const replacements = {
      'URGENT': 'Someone wants to contact you',
      'FREE': 'There is an offer',
      'WIN': 'There is a notification',
      'PRIZE': 'There is a message about rewards',
      'CLAIM': 'There is a message for you',
      'CLICK': 'There is a link to visit',
      'NOW': 'soon',
      '!!!': '.',
      '$$$': '',
      '100%': '',
      'GUARANTEED': '',
      'LIMITED TIME': '',
      'ACT NOW': '',
      "DON'T MISS": '',
      'EXCLUSIVE': '',
      'YOU WON': 'There is a notification'
    };
    
    // Apply tone adjustments
    const tonePrefixes = {
      neutral: '',
      friendly: 'Hi there! ',
      formal: 'We would like to inform you that ',
      casual: 'Hey! '
    };
    
    const prefix = tonePrefixes[tone] || '';
    
    const escapeRegex = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (const [key, value] of Object.entries(replacements)) {
      deSpammed = deSpammed.replace(new RegExp(escapeRegex(key), 'gi'), value);
    }
    
    // Clean up
    deSpammed = deSpammed.replace(/\s+/g, ' ').trim();
    deSpammed = prefix + deSpammed;
    
    if (!deSpammed || deSpammed.length < 5) {
      deSpammed = 'Someone wants to contact you about an offer.';
    }
    
    res.json({
      original: text,
      deSpammedText: deSpammed,
      tone: tone,
      success: true
    });
    
  } catch (error) {
    console.error('De-spamification error:', error);
    res.status(500).json({ error: 'Failed to de-spamify message' });
  }
}); 

// Protected: Get Outlook auth URL
app.get("/outlook/auth-url", protect, async (req, res) => {
  try {
    const response = await axios.get(`${ML_API_BASE}/outlook/auth-url`, {
      params: req.query,
      headers: {
        "X-User-Username": req.user.username,
      },
    });
    res.json(response.data);
  } catch (error) {
    if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
      console.error("Flask ML API is unavailable:", error.message);
      return res.status(503).json({
        error: "Flask ML API is currently unavailable. Please try again later.",
      });
    }
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    console.error(error.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// Public: Handle Outlook OAuth redirect and forward code to frontend
app.get("/outlook/callback", async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) {
      return res.status(400).json({ error: "Authorization code is missing" });
    }
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/app?provider=outlook&code=${code}`);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// Protected: Exchange Outlook auth code for tokens
app.get("/outlook/connect", protect, async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) {
      return res.status(400).json({ error: "Authorization code is missing" });
    }
    const response = await axios.get(`${ML_API_BASE}/outlook/callback`, {
      params: { code },
      headers: {
        "X-User-Username": req.user.username,
      },
    });
    res.json(response.data);
  } catch (error) {
    if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
      console.error("Flask ML API is unavailable:", error.message);
      return res.status(503).json({
        error: "Flask ML API is currently unavailable. Please try again later.",
      });
    }
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    console.error(error.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// Protected: Get latest Outlook emails
app.get("/outlook/emails", protect, async (req, res) => {
  try {
    const response = await axios.get(`${ML_API_BASE}/outlook/emails`, {
      headers: {
        "X-User-Username": req.user.username,
      },
    });
    res.json(response.data);
  } catch (error) {
    if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
      console.error("Flask ML API is unavailable:", error.message);
      return res.status(503).json({
        error: "Flask ML API is currently unavailable. Please try again later.",
      });
    }
    if (error.response) {
      const status =
        error.response.status === 401 ? 400 : error.response.status;
      return res.status(status).json(error.response.data);
    }
    console.error(error.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// ========================================
// PROTECTED ROUTES
// ========================================
// Helper: Apply user blacklist/whitelist rules to a list of emails
async function applyRulesToEmails(userId, emails) {
  if (!emails || !Array.isArray(emails) || emails.length === 0) {
    return { emails: emails || [], spamCount: 0, safeCount: 0 };
  }

  const rules = await Rule.find({ user: userId }).limit(1000).lean();

  const blacklist = new Set();
  const whitelist = new Set();

  rules.forEach(r => {
    if (!r.pattern) return;
    const pattern = r.pattern.toLowerCase().trim();
    if (r.type === 'blacklist') blacklist.add(pattern);
    else if (r.type === 'whitelist') whitelist.add(pattern);
  });

  let spamCount = 0;
  let safeCount = 0;

  const modifiedEmails = emails.map(email => {
    const sender = (email.sender || "").trim();
    if (!sender) {
      const isSpam = email.prediction && email.prediction.toLowerCase() !== 'ham' && email.prediction.toLowerCase() !== 'safe';
      if (isSpam) spamCount++;
      else safeCount++;
      return email;
    }

    // Parse sender (could be "John Doe <john@doe.com>" or just "john@doe.com")
    let emailAddress = sender;
    const emailMatch = sender.match(/<([^>]+)>/);
    if (emailMatch) {
      emailAddress = emailMatch[1];
    }
    emailAddress = emailAddress.toLowerCase().trim();

    const emailParts = emailAddress.split('@');
    const domain = emailParts.length > 1 ? emailParts[1] : '';

    const possiblePatterns = [emailAddress];
    if (domain) {
      possiblePatterns.push(`@${domain}`);
      possiblePatterns.push(domain);
    }

    let matchedType = null;
    for (const pattern of possiblePatterns) {
      if (blacklist.has(pattern)) {
        matchedType = 'blacklist';
        break;
      }
      if (whitelist.has(pattern)) {
        matchedType = 'whitelist';
        break;
      }
    }

    if (matchedType) {
      const isSpam = matchedType === 'blacklist';
      const updatedPrediction = isSpam ? 'spam' : 'ham';

      if (updatedPrediction === 'spam') {
        spamCount++;
      } else {
        safeCount++;
      }

      return {
        ...email,
        prediction: updatedPrediction,
        rule_applied: matchingRule.type
      };
    }

    // If no rule matches, keep original prediction
    const isSpam = email.prediction && email.prediction.toLowerCase() !== 'ham' && email.prediction.toLowerCase() !== 'safe';
    if (isSpam) {
      spamCount++;
    } else {
      safeCount++;
    }

    return email;
  });

  return {
    emails: modifiedEmails,
    spamCount,
    safeCount
  };
}

// Protected: Scan connected emails
app.post("/scan-emails", protect, async (req, res) => {
  try {
    const { provider } = req.body;
    if (!provider || (provider !== "gmail" && provider !== "outlook")) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Validation failed",
          error: validationMessages.providerInvalid
         });
    }
    const response = await axios.post(
      `${ML_API_BASE}/scan-emails`,
      { provider },
      {
        headers: {
          "X-User-Username": req.user.username,
        },
      },
    );
    const ruleResults = await applyRulesToEmails(req.user.id, response.data.emails);
    res.json({
      ...response.data,
      emails: ruleResults.emails,
      spam_count: ruleResults.spamCount,
      safe_count: ruleResults.safeCount
    });
  } catch (error) {
    if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
      console.error("Flask ML API is unavailable:", error.message);
      return res.status(503).json({
        error: "Flask ML API is currently unavailable. Please try again later.",
      });
    }
    if (error.response) {
      const status =
        error.response.status === 401 ? 400 : error.response.status;
      return res.status(status).json(error.response.data);
    }
    console.error(error.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// Protected: IMAP connect
app.post("/imap/connect", protect, async (req, res) => {
  try {
    const { email, password, host, port } = req.body;

    if (!email || !password || !host) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        error: validationMessages.imapFieldsRequired
      });
    }

    res.json({
      success: true,
      message: "IMAP connection configured successfully",
      data: { email, host, port: port || 993 }
    });
  } catch (error) {
    console.error("IMAP connection error:", error.message);
    res.status(500).json({
      success: false,
      error: "Failed to connect to IMAP server"
    });
  }
});

// ========================================
// START SERVER
// ========================================

const PORT = config.port;
const server = app.listen(PORT, () => {
  displayBanner();
  const totalTime = Date.now() - SERVER_START_TIME;
  console.log(`⏱️ Total startup time: ${totalTime}ms`);
});

// ====== PREDICTION STATISTICS ======
app.get('/api/stats', protect, async (req, res) => {
  try {
    const userId = req.user.id;
    const total = await History.countDocuments({ user: userId });
    const spam = await History.countDocuments({ user: userId, prediction: 'spam' });
    const ham = await History.countDocuments({ user: userId, prediction: 'ham' });

    const daily = await History.aggregate([
      { $match: { user: userId } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: -1 } },
      { $limit: 7 }
    ]);

    const feedbackCount = await History.countDocuments({
      user: userId,
      feedback: { $exists: true }
    });

    res.json({
      success: true,
      data: {
        total,
        spam,
        ham,
        spamRatio: total > 0 ? (spam / total) * 100 : 0,
        daily,
        feedbackCount
      }
    });
  } catch (error) {
    console.error('Stats error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});



// ========================================
// GRACEFUL SHUTDOWN LOGIC
// ========================================

// 1. Keep track of active connections
const connections = new Set();
server.on('connection', (connection) => {
  connections.add(connection);
  connection.on('close', () => connections.delete(connection));
});

// 2. The Graceful Shutdown Function
const gracefulShutdown = async (signal) => {
  console.log(`\n🛑 [${signal}] signal received: closing HTTP server...`);

  let forceClosed = false;

  // 15-Second Fallback Timeout
  const timeoutId = setTimeout(async () => {
    forceClosed = true;
    console.error('⚠️ [Timeout] Could not close connections in time, forcefully shutting down!');

    // Destroy all active connections forcefully
    for (const connection of connections) {
      connection.destroy();
    }

    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
    process.exit(1);
  }, 15000); // 15 seconds grace period

  // Close server to reject NEW requests
  server.close(async () => {
    if (forceClosed) return;

    clearTimeout(timeoutId);
    console.log('✅ HTTP server closed. All active requests completed normally.');

    try {
      if (mongoose.connection.readyState === 1) {
        await mongoose.disconnect();
        console.log('✅ MongoDB disconnected successfully.');
      }
      process.exit(0);
    } catch (err) {
      console.error('❌ Error during MongoDB disconnection:', err);
      process.exit(1);
    }
  });

  // Safely close idle connections immediately to speed up shutdown
  if (server.closeIdleConnections) {
    server.closeIdleConnections();
  }
};

// 3. Assign the listeners
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ===== SEARCH HISTORY =====
app.get('/api/history/search', protect, async (req, res) => {
  try {
    const { q, type, startDate, endDate } = req.query;
    const query = { user: req.user.id };

    // Search by message text
    if (q && q.trim()) {
      query.query = { $regex: q.trim(), $options: 'i' };
    }

    // Filter by prediction type
    if (type && type !== 'all') {
      query.prediction = type;
    }

    // Filter by date range
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }

    const results = await History.find(query)
      .sort({ createdAt: -1 })
      .limit(100);

    const total = await History.countDocuments(query);

    res.json({
      success: true,
      data: results,
      total,
      count: results.length
    });
  } catch (error) {
    console.error('Search error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
// Protected: get the current IMAP connection status for the logged-in user
app.get("/imap/status", protect, async (req, res) => {
  try {
    const response = await axios.get(`${ML_API_BASE}/imap/status`, {
      headers: { "X-User-Username": req.user.username },
    });
    res.json(response.data);
  } catch (error) {
    if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
      console.error("Flask ML API is unavailable:", error.message);
      return res.status(503).json({
        error: "Flask ML API is currently unavailable. Please try again later.",
      });
    }
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    console.error(error.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

//Get activity data for Heatmap
app.get('/api/activity/:userId', protect, async (req, res) => {
  try {
    const userId = req.params.userId;
    const { year, month } = req.query;

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const activities = await History.aggregate([
      {
        $match: {
          user: mongoose.Types.ObjectId(userId),
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            day: { $dayOfMonth: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          count: { $sum: 1 }
        }
      }
    ]);

    const result = {};
   activities.forEach(item => {
      result[item._id] = item.count;
    });

    res.json(result);
  } catch (error) {
    console.error("Error fetching activity data:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});
// Protected: update the scheduled scan interval for the connected IMAP inbox
app.put("/imap/schedule", protect, async (req, res) => {
  try {
    const response = await axios.put(`${ML_API_BASE}/imap/schedule`, req.body, {
      headers: { "X-User-Username": req.user.username },
    });
    res.json(response.data);
  } catch (error) {
    if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
      console.error("Flask ML API is unavailable:", error.message);
      return res.status(503).json({
        error: "Flask ML API is currently unavailable. Please try again later.",
      });
    }
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    console.error(error.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// Protected: revoke IMAP access and delete stored credentials
app.post("/imap/disconnect", protect, async (req, res) => {
  try {
    const response = await axios.post(
      `${ML_API_BASE}/imap/disconnect`,
      {},
      { headers: { "X-User-Username": req.user.username } },
    );
    res.json(response.data);
  } catch (error) {
    if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
      console.error("Flask ML API is unavailable:", error.message);
      return res.status(503).json({
        error: "Flask ML API is currently unavailable. Please try again later.",
      });
    }
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    console.error(error.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// Protected: trigger an immediate scan of the connected IMAP inbox
app.post("/imap/scan-now", protect, async (req, res) => {
  try {
    const response = await axios.post(
      `${ML_API_BASE}/imap/scan-now`,
      {},
      { headers: { "X-User-Username": req.user.username } },
    );
    const ruleResults = await applyRulesToEmails(req.user.id, response.data.emails);
    res.json({
      ...response.data,
      emails: ruleResults.emails,
      spam_count: ruleResults.spamCount,
      safe_count: ruleResults.safeCount
    });
  } catch (error) {
    if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
      console.error("Flask ML API is unavailable:", error.message);
      return res.status(503).json({
        error: "Flask ML API is currently unavailable. Please try again later.",
      });
    }
    if (error.response) {
      const status = error.response.status === 401 ? 400 : error.response.status;
      return res.status(status).json(error.response.data);
    }
    console.error(error.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// Protected: get the stored history of scheduled/manual IMAP scan results
app.get("/imap/scan-results", protect, async (req, res) => {
  try {
    const response = await axios.get(`${ML_API_BASE}/imap/scan-results`, {
      params: req.query,
      headers: { "X-User-Username": req.user.username },
    });
    const ruleResults = await applyRulesToEmails(req.user.id, response.data.results);
    res.json({
      ...response.data,
      results: ruleResults.emails
    });
  } catch (error) {
    if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
      console.error("Flask ML API is unavailable:", error.message);
      return res.status(503).json({
        error: "Flask ML API is currently unavailable. Please try again later.",
      });
    }
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    console.error(error.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// ========================================
// ERROR HANDLERS
// ========================================

app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large' || err.message === 'request entity too large') {
    return res.status(413).json({
      success: false,
      error: 'Payload too large. Please reduce the size of your request.',
      message: 'Request size exceeds 1MB limit.',
    });
  }
  next(err);
});

app.use(errorHandler);

module.exports = { app, applyRulesToEmails };
