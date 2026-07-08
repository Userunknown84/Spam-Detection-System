const History = require("../models/History");
const mongoose = require("mongoose");

// Utility function to sanitize NoSQL inputs
const sanitizeInput = (v) => {
  if (v instanceof Object) {
    for (let key in v) {
      if (/^\$/.test(key)) {
        delete v[key];
      } else {
        sanitizeInput(v[key]);
      }
    }
  }
  return v;
};

const getSafeUserId = (req) => sanitizeInput(req.user.id);

const getPaginationParams = (query, defaultLimit = 10, maxLimit = 100) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = parseInt(query.limit) || defaultLimit;
  const safeLimit = Math.max(1, Math.min(limit, maxLimit));
  const skip = (page - 1) * safeLimit;

  return { page, safeLimit, skip };
};

// Get logged-in user's history
const getHistory = async (req, res) => {
  try {
    const safeUserId = getSafeUserId(req);

    // Get pagination parameters from query
    const { page, safeLimit, skip } = getPaginationParams(req.query, 10);

    // Get total count and paginated data using sanitized ID
    const total = await History.countDocuments({ user: safeUserId });
    const history = await History.find({ user: safeUserId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit);

    const totalPages = Math.ceil(total / safeLimit);

    res.json({
      success: true,
      data: history,
      pagination: {
        total,
        page,
        limit: safeLimit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (err) {
    res.status(500).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Server error",
      },
    });
  }
};

// Delete a single history item
const deleteHistoryItem = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({
      error: "Invalid history id",
    });
  }

  try {
    const safeHistoryId = sanitizeInput(req.params.id);
    const safeUserId = getSafeUserId(req);

    const historyItem = await History.findOneAndDelete({
      _id: safeHistoryId,
      user: safeUserId,
    });

    if (!historyItem) {
      return res.status(404).json({ error: "History item not found" });
    }

    res.json({ message: "History item deleted" });
  } catch (err) {
    console.error("Delete history error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// Clear all history for logged-in user
const clearHistory = async (req, res) => {
  try {
    const safeUserId = getSafeUserId(req);
    await History.deleteMany({ user: safeUserId });

    res.json({ message: "History cleared successfully" });
  } catch (err) {
    console.error("Clear history error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// Search history
const searchHistory = async (req, res) => {
  try {
    const safeUserId = getSafeUserId(req);
    const { q, type, startDate, endDate } = req.query;

    const query = { user: safeUserId };

    if (q) {
      const escapeRegex = (string) => {
        return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      };
      query.query = { $regex: escapeRegex(q), $options: "i" };
    }

    if (type && type !== "all") {
      query.type = type;
    }

    if (startDate || endDate) {
      query.createdAt = {};

      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }

      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }

    const { page, safeLimit, skip } = getPaginationParams(req.query, 50);

    const total = await History.countDocuments(query);
    const history = await History.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit);

    const totalPages = Math.ceil(total / safeLimit);

    res.json({
      success: true,
      data: history,
      pagination: {
        total,
        page,
        limit: safeLimit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (err) {
    console.error("Search history error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// Bulk delete history items
const bulkDeleteHistory = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid request. 'ids' must be a non-empty array.",
      });
    }

    const sanitizedIds = ids.map((id) =>
      typeof id === "string" ? sanitizeInput(id.trim()) : id
    );

    if (!sanitizedIds.every((id) => typeof id === "string" && mongoose.Types.ObjectId.isValid(id))) {
      return res.status(400).json({
        success: false,
        message: "All history ids must be valid ObjectIds.",
      });
    }

    const safeUserId = getSafeUserId(req);

    const result = await History.deleteMany({
      _id: { $in: sanitizedIds },
      user: safeUserId,
    });

    res.json({
      success: true,
      deletedCount: result.deletedCount,
      message: `${result.deletedCount} items deleted successfully`,
    });
  } catch (error) {
    console.error("Bulk delete history error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Get history count
const  getHistoryCount = async (req, res) => {
  try {
    const count = await History.countDocuments({ user: req.user.id });
    res.json({ success: true, count });
  } catch (error) {
    console.error('Count error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  getHistory,
  searchHistory,
  deleteHistoryItem,
  clearHistory,
  bulkDeleteHistory,
 getHistoryCount
};