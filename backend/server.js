const { checkCache, setCache } = require('./middleware/cacheMiddleware');
const { formatError, errorHandler, errorCodes, classifyMlApiError , handleMlApiError } = require('./utils/errorHelper');
const logger = require("./utils/logger");
require("dotenv").config();

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at:", promise, "reason:", reason);
});
const dns = require("dns");
const validateEnv = require('./utils/validateEnv');
validateEnv(); // Validate environment variables
dns.setServers(["8.8.8.8", "1.1.1.1"]); // ensure SRV records resolve on all networks
const express = require("express");
const seedAdminUser = require("./seeders/adminSeeder");
const { refreshAdminRulesCache } = require("./utils/adminRuleEvaluator");
const { getHealthStatus } = require('./utils/healthCheck');
const cors = require("cors");
const config = require('./config');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const compression = require('compression');
const { v4: uuidv4 } = require('uuid');
const helmet = require('helmet');
const axios = require("axios");

const { corsOptions } = require('./config/corsConfig');
// Add Multimodal Detection routes
const multimodalRoutes = require('./routes/multimodalRoutes');
app.use('/api/multimodal', multimodalRoutes);

// Initialize background jobs
require('./jobs/archivalCron');
require('./jobs/webhookRetryCron');
const { preventCacheStampede } = require('./middleware/cacheMiddleware');

const adversarialRoutes = require('./routes/adversarialRoutes');
app.use('/api/adversarial', adversarialRoutes);

// Add EvoMail routes
const evoMailRoutes = require('./routes/evoMailRoutes');
app.use('/api/evomail', evoMailRoutes);

// ===== STARTUP TIMER =====
const SERVER_START_TIME = Date.now();
const startupLogs = [];
// Add VBSF routes
const visualRoutes = require('./routes/visualRoutes');
app.use('/api/visual', visualRoutes);
const logStartupTime= (component, startTime) => {



// Add EvoMail routes

const evoMailRoutes = require('./routes/evoMailRoutes');
const poisoningRoutes = require('./routes/poisoningRoutes');

const healthRoutes = require("./routes/healthRoutes");
const predictionRoutes = require("./routes/predictionRoutes");
const feedbackRoutes = require('./routes/feedbackRoutes');
const emailIntegrationRoutes = require("./routes/emailIntegrationRoutes");
const imapRoutes = require("./routes/imapRoutes");
const utilityRoutes = require("./routes/utilityRoutes");

// ===== STARTUP TIMER =====
const SERVER_START_TIME = Date.now();
const startupLogs = [];
const { configureAxios } = require('./config/axios');
configureAxios(); // Apply the global axios configuration
const logStartupTime = (component, startTime) => {

  const elapsed = Date.now() - startTime;
  startupLogs.push({ component, elapsed });
  logger.info(`⏱️ ${component} loaded in ${elapsed}ms`);
};

const mongoose = require("mongoose");

const History = require("./models/History");
const Rule = require("./models/Rule");
const User = require("./models/User");
const { matchKeywordRule } = require("./utils/keywordRules");

const displayBanner = require('./utils/banner');
const { upload } = require('./config/multerConfig');
const FormData = require("form-data");

const app = express();



// Apply standard throttling to the heavy ML prediction route
const { apiLimiter } = require('./middleware/rateLimiter');
app.use('/predict', apiLimiter);
app.use('/api', feedbackRoutes);

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
  logger.info('✅ Sentry initialized');

  // Make Sentry available globally
  global.Sentry = Sentry;
} else {
  logger.info('ℹ️ Sentry disabled (no valid DSN provided)');
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
  logger.info("Attempting to connect to MongoDB...");
  logger.info('Max retries:', retries, 'Delay between retries (ms):', delay);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(config.mongodbUri);
      logger.info(`✅ MongoDB connected successfully (attempt ${attempt})`);
      monitorConnectionPool();
      seedAdminUser();
      refreshAdminRulesCache();
      return true;
    } catch (err) {
      logger.error(`❌ MongoDB connection attempt ${attempt} failed:`, err.message);

      if (attempt === retries) {
        logger.error("Max retries reached. Exiting process.");
        logger.error("Please check your MongoDB connection string and ensure the database is accessible.");
        logger.error('1.MongoDB is running');
        logger.error('2.MongoDB URI is correct in .env file');
        logger.error('   3. Network connectivity\n');
        process.exit(1);
      }

      logger.info(`⏳ Waiting ${delay / 1000}s before retry...\n`);
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

        logger.debug(`[DB Pool] Size: ${size}, Available: ${available}, Used: ${used} (${usagePercent}%)`);

        //Alert if usage exceeds 80%
        if (usagePercent > 80) {
          logger.warn(`[DB Pool] ⚠️ High connection pool usage: ${usagePercent.toFixed(2)}%`);
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
      logger.info(`🐢 [${new Date().toISOString()}] Slow Query (${duration}ms):`);
      logger.info(`   Collection: ${this._collection.collectionName}`);
      logger.info(`   Query:`, JSON.stringify(this._conditions));
    }

    return result;
  };
}

// Start connection with retry
connectWithRetry();


app.use(cors(corsOptions));
app.use(helmet());
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use('/uploads', express.static('uploads'));


app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Spam Detection API Docs'
}));


// ===== REQUEST ID MIDDLEWARE =====
app.use((req, res, next) => {
  // Generate a unique request ID
  const requestId = uuidv4().substring(0, 8); // Shorten the UUID for easier logging
  req.requestId = requestId;

  //Add to response headers
  res.setHeader('X-Request-ID', requestId);

  // Log the request with the request ID
  logger.info(`[${requestId}] ${req.method} ${req.originalUrl}`);

  //Track time
  const startTime = Date.now();

  //Log when response is finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info(`[${requestId}] ⬅️ ${req.method} ${req.originalUrl} completed in ${duration}ms (${res.statusCode})`);
  });

  next();
});

// Auth routes , History routes
const authRoutes = require("./routes/authRoutes");
const historyRoutes = require("./routes/historyRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const chatRoutes = require("./routes/chatRoutes");
const ruleRoutes = require("./routes/ruleRoutes");
const adminRuleRoutes = require("./routes/adminRuleRoutes");
const feedbackAdminRoutes = require("./routes/feedbackAdminRoutes");
const reportRoutes = require("./routes/reportRoutes");
const jobRoutes = require("./routes/jobRoutes");

const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const { ExpressAdapter } = require('@bull-board/express');
const { predictionQueue } = require('./jobs/predictionQueue');

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');
createBullBoard({
  queues: [new BullMQAdapter(predictionQueue)],
  serverAdapter: serverAdapter,
});

const { protect } = require('./middleware/authMiddleware');
const adminAuth = [protect, (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ error: 'Access denied, admin only' });
    }
}];

app.use('/admin/queues', adminAuth, serverAdapter.getRouter());


app.use("/", predictionRoutes);
app.use("/", emailIntegrationRoutes);
app.use("/", imapRoutes);
app.use("/", utilityRoutes);

// Versioned routes (v1)
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/history", historyRoutes);
app.use("/api/v1/analytics", analyticsRoutes);
app.use("/api/v1/chat", chatRoutes);
app.use("/api/v1/rules", ruleRoutes);
app.use("/api/v1/admin/rules", adminRuleRoutes);
app.use("/api/v1/feedback/admin", feedbackAdminRoutes);
app.use("/api/v1/reports", reportRoutes);
app.use("/api/v1/jobs", jobRoutes);

// Keep old routes for backward compatibility
app.use("/api/auth", authRoutes);
app.use("/api/history", historyRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/chat", chatRoutes);
app.use("/health", healthRoutes);
app.use("/api/rules", ruleRoutes);
app.use("/api/reports", reportRoutes);
app.use('/api/adversarial', adversarialRoutes);
app.use('/api/evomail', evoMailRoutes);
app.use('/api/poisoning', poisoningRoutes);



app.get("/", (req, res) => {
  res.send("Node backend running ");
});


app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});


// ========================================
// START SERVER
// ========================================

const PORT = config.port;
const server = app.listen(PORT, () => {
  displayBanner();
  const totalTime = Date.now() - SERVER_START_TIME;
  logger.info(`⏱️ Total startup time: ${totalTime}ms`);
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
  logger.info(`\n🛑 [${signal}] signal received: closing HTTP server...`);

  let forceClosed = false;

  // 15-Second Fallback Timeout
  const timeoutId = setTimeout(async () => {
    forceClosed = true;
    logger.error('⚠️ [Timeout] Could not close connections in time, forcefully shutting down!');

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
    logger.info('✅ HTTP server closed. All active requests completed normally.');

    try {
      if (mongoose.connection.readyState === 1) {
        await mongoose.disconnect();
        logger.info('✅ MongoDB disconnected successfully.');
      }
      process.exit(0);
    } catch (err) {
      logger.error('❌ Error during MongoDB disconnection:', err);
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
module.exports = { app };



