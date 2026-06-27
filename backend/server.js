const { formatError, errorHandler, errorCodes } = require('./utils/errorHelper');
require("dotenv").config();
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

// ===== STARTUP TIMER =====
const SERVER_START_TIME = Date.now();
const startupLogs = [];

const logStartupTime= (component, startTime) => {
  const elapsed = Date.now() - startTime;
  startupLogs.push({ component, elapsed });
    console.log(`⏱️ ${component} loaded in ${elapsed}ms`);
};

// Configure global request interceptor to append the internal secret API key
axios.interceptors.request.use(
  (config) => {
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

const multer = require("multer");
const displayBanner = require('./utils/banner');
const upload = multer();
const FormData = require("form-data");

const app = express();

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
        captureException: () => {},
        setUser: () => {},
        setTags: () => {},
        setExtra: () => {},
    };
}

// Connect to MongoDB WITH RETRY
const connectWithRetry = async (retries=5, delay=5000) => {
  console.log("Attempting to connect to MongoDB...");
  console.log('Max retries:', retries, 'Delay between retries (ms):', delay);

  for(let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(config.mongodbUri);
            console.log(`✅ MongoDB connected successfully (attempt ${attempt})`);
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
            
            console.log(`⏳ Waiting ${delay/1000}s before retry...\n`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
};

//MONGODB CONNECTION POOL MONITORING
const monitorConnectionPool = () => {
  setInterval(() => {
    try {
      const pool = mongoose.connection.client.topology.s.pool;
      if(pool) {
        const size= pool.size||0;
        const available= pool.availableConnections||0;
        const used= pool.usedCount||0;
        const usagePercent = size > 0 ? (used / size) * 100 : 0;

        console.log(`[DB Pool] Size: ${size}, Available: ${available}, Used: ${used} (${usagePercent}%)`);

        //Alert if usage exceeds 80%
        if(usagePercent > 80){
          console.warn(`[DB Pool] ⚠️ High connection pool usage: ${usagePercent.toFixed(2)}%`);
        }
      }
    } catch (err) {
    }
  },3000); // every 3 seconds
};

//Call after MONGODB connection is established
const mongoStart = Date.now();
mongoose
    .connect(process.env.MONGODB_URI)
    .then(() => {
        console.log('MongoDB', mongoStart);
        monitorConnectionPool(); 
        seedAdminUser();
    })
    .catch((err) => console.error("❌ MongoDB connection error:", err));


if(process.env.NODE_ENV === 'development'){
  //Log all queries in development mode
  mongoose.set('debug',true);
} else {
  // Log only slow queries in production mode
  const originalExec = mongoose.Query.prototype.exec;
  mongoose.Query.prototype.exec = async function() {
    const start = Date.now();
    const result = await originalExec.apply(this, arguments);
    const duration = Date.now() - start;

    if(duration > 100){ // Log queries taking longer than 100ms
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
  origin: config.corsOrigins,
  credentials: true,
};
app.use(cors(corsOptions));
app.use(helmet());
app.use(compression());
app.use(express.json({limit: '1mb'}));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use('/uploads', express.static('uploads'));

app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'Server is running',
        limit: '1MB'
    });
});

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
app.use("/api/rules", ruleRoutes);
app.use("/api/reports", reportRoutes);

const { protect } = require("./middleware/authMiddleware");

app.get("/", (req, res) => {
  res.send("Node backend running ");
});

// Health check endpoint
app.get("/health", async (req, res) => {
  try {
    const healthStatus = await getHealthStatus();
    const statusCode = healthStatus.status === "healthy" ? 200 : 503;
    res.status(statusCode).json(healthStatus);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve health status',
      error: error.message
    });
  }
});

// Protected: only authenticated users can predict
app.post("/predict", protect, async (req, res) => {
  try {
    console.log("Reached /predict");
    const { text, type, sender } = req.body;
    console.log("Received:", text, type, sender);

    // Check 1: fields must exist
    if (!text || !type) {
      return res.status(400).json({ error: "Text and type are required" });
    }

    // Check 2: must be strings
    if (typeof text !== "string" || typeof type !== "string") {
      return res.status(400).json({ error: "Text and type must be strings." });
    }

    // Check 3: must not be empty or only whitespace
    if (text.trim().length === 0) {
      return res
        .status(400)
        .json({ error: "Text must not be empty or whitespace." });
    }

    // Check 4: validate type is one of the accepted values

    const allowedTypes = ["sms", "email", "url", "message"];

    if (!allowedTypes.includes(type.toLowerCase())) {
      return res.status(400).json({
        error: `Invalid type. Allowed values are: ${allowedTypes.join(", ")}.`,
      });
    }

    // Check 5: validate text length
    if (text.trim().length > 5000) {
      return res.status(413).json({
        error:
          "Text payload exceeds maximum allowed length of 5000 characters.",
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
        return res.json({
          input: text,
          prediction: prediction,
          confidence: 1.0,
          confidence_level: "high",
          level_color: isSpam ? "red" : "green",
          level_emoji: isSpam ? "🔴" : "🟢",
          rule_applied: rule.type
        });
      }
    }

    console.log("Calling Flask...");

    const response = await axios.post(
      process.env.API || "http://localhost:5000/predict",
      {
        text: text.trim(),
        type: type.toLowerCase(),
      },
    );
    console.log("Flask responded:", response.data);

    // Save history automatically (best-effort: a DB failure shouldn't break the prediction response)
    try {
      await History.create({
        user: req.user.id,
        query: text,
        prediction: response.data.prediction,
        type: type,
        confidence: response.data.confidence,
      });
    } catch (historyError) {

      console.error(`[${req.requestId}] Failed to save history: ${historyError.message}`);
    }

    res.json(response.data);
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
    res.status(500).json({ error: "Something went wrong" });
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
        .json({ error: "text and correct_label are required" });
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
            .json({ error: "File size exceeds limit of 2MB" });
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
          return res.status(400).json({ error: "Email headers are required" });
        }

        if (typeof headers !== "string") {
          return res
            .status(400)
            .json({ error: "Email headers must be a string." });
        }

        if (headers.trim().length === 0) {
          return res
            .status(400)
            .json({ error: "Email headers must not be empty." });
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
app.post("/bulk-predict", protect, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Check file size
    if (req.file.size > 2 * 1024 * 1024) {
      return res.status(413).json({ error: "File size exceeds limit of 2MB" });
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
  
  const rules = await Rule.find({ user: userId });
  
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
    
    const matchingRule = rules.find(r => possiblePatterns.includes(r.pattern.toLowerCase().trim()));
    if (matchingRule) {
      const isSpam = matchingRule.type === 'blacklist';
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
        .json({ error: "Invalid provider. Must be 'gmail' or 'outlook'." });
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
        error: "Email, password, and host are required"
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
// ERROR HANDLERS (ONLY ONCE!)
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

// ========================================
// START SERVER
// ========================================

const PORT = config.port;
const server = app.listen(PORT, () => {
  displayBanner();
  const totalTime = Date.now() - SERVER_START_TIME;
  displayBanner();
  console.log(`⏱️ Total startup time: ${totalTime}ms`);
// ====== PREDICTION STATISTICS ======
app.get('/api/stats', protect, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const total = await History.countDocuments({ user: userId });
        const spam = await History.countDocuments({ user: userId, prediction: 'spam' });
        const ham = await History.countDocuments({ user: userId, prediction: 'ham' });
        
        const daily = await History.aggregate([
            { $match: { user: userId } },
            { $group: { 
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, 
                count: { $sum: 1 } 
            }},
            { $sort: { _id: -1 } },
            { $limit: 7 }
        ]);
        
        // Get accuracy if feedback exists
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
// GRACEFUL SHUTDOWN
// ========================================

const gracefulShutdown = async (signal) => {
  console.log(`\nReceived ${signal}. Closing server...`);
  server.close(async () => {
    console.log('HTTP server closed.');
    try {
      await mongoose.disconnect();
      console.log('MongoDB connection closed.');
    } catch (err) {
      console.error('Error closing MongoDB connection:', err);
    }
    console.log('Shutdown complete. Exiting process.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

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
});

// ========================================
// START SERVER
// ========================================

const PORT = config.port;
const server = app.listen(PORT, () => {
  const totalTime = Date.now() - SERVER_START_TIME;
  displayBanner();
  console.log(`⏱️ Total startup time: ${totalTime}ms`);
});
// Listen for termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = { app, applyRulesToEmails };
 
