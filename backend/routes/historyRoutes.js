const express = require("express");
const router = express.Router();

const {
  getHistory,
  searchHistory,
  deleteHistoryItem,
  clearHistory,
  bulkDeleteHistory,
  getHistoryCount,
} = require("../controllers/historyController");

const { protect } = require("../middleware/authMiddleware");

router.use(protect);

// Get logged-in user's history
router.get("/", getHistory);

// Search user's history
router.get("/search", searchHistory);

// Bulk delete history items
router.delete("/bulk-delete", bulkDeleteHistory);

// Delete one history item
router.delete("/:id", deleteHistoryItem);

// Clear all history
router.delete("/", clearHistory);

router.get('/count', protect,getHistoryCount);
module.exports = router;