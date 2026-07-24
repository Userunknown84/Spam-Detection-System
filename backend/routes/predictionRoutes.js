const express = require('express');
const router = express.Router();
const axios = require('axios');
const multer = require('multer');
const FormData = require('form-data');
const domainReputation = require('../services/domainReputation');
const crypto = require('crypto');
const { checkCache, setCache, redisClient } = require('../middleware/cacheMiddleware');
const { protect } = require('../middleware/authMiddleware');
const { predictLimiter } = require('../middleware/rateLimiter');
const { preventCacheStampede } = require('../middleware/cacheMiddleware');
const { classifyMlApiError } = require('../utils/errorHelper');
const validationMessages = require('../utils/validationMessages');
const History = require('../models/History');
const Rule = require('../models/Rule');
const { matchKeywordRule } = require('../utils/keywordRules');
const { evaluateAdminRules } = require('../utils/adminRuleEvaluator');
const upload = multer();
const { mlCircuitBreaker } = require('../utils/circuitBreaker');
const { getFallbackPrediction } = require('../utils/fallbackDetector');

// Helper to dispatch webhook
const dispatchWebhook = require('../utils/dispatchWebhook'); // Aapko dispatchWebhook ko bhi alag file mein nikalna padega

// ML API Base URL
const ML_API_BASE = (process.env.API || "http://localhost:5000/predict").replace(/\/predict$/, "");

router.post("/predict", predictLimiter, preventCacheStampede, protect, checkCache, async (req, res) => {
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
 
     // ---> NEW: Check Admin Override Rules
     const adminOverride = evaluateAdminRules(text);
     if (adminOverride && adminOverride.matched) {
       const isSpam = ["spam", "malicious", "smishing"].includes(adminOverride.action);
       
       // Save history for admin rule match
       try {
         await History.create({
           user: req.user.id,
           query: text,
           prediction: adminOverride.action,
           type: type,
           confidence: 1.0,
         });
       } catch (historyError) {
         console.error("Failed to save history for admin rule match:", historyError.message);
       }
       
       console.log(`Admin override matched:`, adminOverride.description);
       
       return res.json({
         input: text,
         prediction: adminOverride.action,
         result: adminOverride.action,
         confidence: 1.0,
         confidence_score: 100.0,
         decision_score: null,
         confidence_level: "high",
         level_color: isSpam ? "red" : "green",
         level_emoji: isSpam ? "🔴" : "🟢",
         rule_applied: "admin_override",
         explanation: `Matched admin override rule: ${adminOverride.description}`,
         meta: {
           source: adminOverride.source,
           ruleId: adminOverride.ruleId
         }
       });
     }

     console.log("Calling Flask...");
 
     // Check ML Cache globally before calling Flask
     const cacheKey = `spam_cache:${require('crypto').createHash('sha256').update(text).digest('hex')}`;
<<<<<<< Updated upstream
=======
     const { redisClient } = require("./middleware/cacheMiddleware");
>>>>>>> Stashed changes
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
     
     const requestFn = () => axios.post(
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

     const fallbackFn = (error) => {
       console.warn(`[${req.requestId}] Circuit breaker fallback triggered. Error: ${error.message}`);
       return { data: getFallbackPrediction(text, type) };
     };

     const response = await mlCircuitBreaker.fire(requestFn, fallbackFn);
     
     console.timeEnd("ML_API_CALL");
     console.log("Flask responded:", response.data);
 
     let historyId = null;
    // Save history automatically (best-effort)
    try {
      const historyRecord = await History.create({
        user: req.user.id,
        query: text,
        prediction: response.data.prediction,
        type: type,
        confidence: response.data.confidence || response.data.probability,
      });
      historyId = historyRecord._id;
    } catch (historyError) {
      console.error(`[${req.requestId}] Failed to save history: ${historyError.message}`);
    }

    const finalResponse = { ...response.data, historyId };
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

router.post("/feedback", protect, async (req, res) => {
 try {
    const { text, predicted_label, correct_label, historyId, note } = req.body;

    if (!text || !correct_label) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Validation failed",
          error: validationMessages.feedbackFieldsRequired
        });
    }

    if (historyId) {
      try {
        const label = predicted_label.toLowerCase() === correct_label.toLowerCase() ? 'correct' : 'incorrect';
        await History.findByIdAndUpdate(historyId, {
          feedback: {
            label,
            note: note || '',
            submittedAt: new Date()
          }
        });
      } catch (err) {
        console.error(`[${req.requestId}] Failed to update History document with feedback:`, err.message);
        return res.status(500).json({ error: "Failed to record feedback in database" });
      }
    }

    let flaskFailed = false;
    let response;
    try {
      response = await axios.post(`${ML_API_BASE}/feedback`, {
        text,
        predicted_label,
        correct_label,
      });
    } catch (flaskErr) {
      console.error(`[${req.requestId}] Flask ML API failed to record feedback:`, flaskErr.message);
      flaskFailed = true;
      // We still return success if MongoDB succeeded, as per fallback plan.
      if (!historyId) {
        throw flaskErr;
      }
    }

    if (flaskFailed) {
      res.status(201).json({ message: "Feedback recorded in database, but failed to sync to ML engine.", historyId });
    } else {
      res.status(response.status).json({ ...response.data, historyId });
    }
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

<<<<<<< Updated upstream
router.get("/feedback/stats", protect, async (req, res) => {
  try {
    const response = await axios.get(`${ML_API_BASE}/feedback/stats`);
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
    console.error(`[${req.requestId}] Feedback stats error:`, error.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

=======
>>>>>>> Stashed changes
router.post("/analyze-email-header", protect, upload.single("file"), async (req, res) => {
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
});

router.post("/bulk-predict", predictLimiter, protect, upload.single("file"), async (req, res) => {
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

router.post('/predict', async (req, res) => {
  try {
    const { text, sender } = req.body;
let domainScore = 0;
    if (sender) {
      const domain = sender.split('@')[1];
      if (domain) {
        const result = await domainReputation.checkReputation(domain);
        domainScore = result.score;
      }
    }
    
    // Get ML prediction
    const mlResult = await getMLPrediction(text);
    
    // Combine scores
    const finalScore = (mlResult.confidence * 100 + domainScore) / 2;
    const isSpam = finalScore > 50 || mlResult.prediction === 'spam';
    
    res.json({
      prediction: isSpam ? 'spam' : 'ham',
      confidence: finalScore,
      domainReputation: domainScore,
      mlConfidence: mlResult.confidence
    });
  } catch (error) {
    res.status(500).json({ error: 'Prediction failed' });
  }
});


router.post("/bulk-predict/export", predictLimiter, protect, upload.single("file"), async (req, res) => {
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
});

router.get("/spam-insights", protect, async (req, res) => {
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

router.get("/api/wordcloud", async (req, res) => {
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

router.get("/api/word-of-the-day", async (req, res) => {
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

router.get("/importance", async (req, res) => {
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

router.get('/stats', protect, async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get all predictions for user
    const predictions = await Prediction.find({ userId });
    
    // Calculate stats
    const total = predictions.length;
    const todayCount = predictions.filter(p => 
      new Date(p.createdAt) >= today
    ).length;
    
    // Spam vs Ham breakdown
    const spamCount = predictions.filter(p => 
      p.result === 'spam' || p.result === 'smishing'
    ).length;
    const hamCount = predictions.filter(p => 
      p.result === 'ham' || p.result === 'safe'
    ).length;

    res.json({
      today: todayCount,
      total: total,
      spamCount: spamCount,
      hamCount: hamCount
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});


module.exports = router;