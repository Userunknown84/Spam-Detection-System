const express = require("express");
const router = express.Router();

const { chatLimiter } = require("../middleware/rateLimiter");
<<<<<<< Updated upstream
const { chatHandler, healthCheck, listModels } = require("../controllers/chatController");

// Chat endpoint with fallback support and rate limiting
router.post("/", chatLimiter, chatHandler);

// Health check endpoint - check which models are available
router.get("/health", healthCheck);

// List available models
router.get("/models", listModels);

module.exports = router;
=======
const { chatHandler } = require("../controllers/chatController");


router.post("/", chatLimiter, chatHandler);

module.exports = router;
>>>>>>> Stashed changes
