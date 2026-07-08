const express = require("express");
const router = express.Router();

const { chatLimiter } = require("../middleware/rateLimiter");
const { chatHandler } = require("../controllers/chatController");


router.post("/", chatLimiter, chatHandler);

module.exports = router;
