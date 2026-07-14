const mongoose = require("mongoose");
const History = require("../models/History");

const DATE_FORMATS = {
  daily: "%Y-%m-%d",
  weekly: "%Y-%U",
  monthly: "%Y-%m",
};

const ANALYTICS_RANGES = Object.keys(DATE_FORMATS);

// Labels the ML API returns for a clean verdict (text -> "ham", url -> "safe").
const CLEAN_LABELS = new Set(["ham", "safe"]);

// Known threat labels (everything else will be categorized as "unknown")
const THREAT_LABELS = new Set(["spam", "smishing", "malicious", "offensive"]);

// Helper to classify a label
const classifyLabel = (label) => {
  if (CLEAN_LABELS.has(label)) return "clean";
  if (THREAT_LABELS.has(label)) return "threat";
  return "unknown";
};

const pct = (count, total) => (total ? Number(((count / total) * 100).toFixed(2)) : 0);

const getUserObjectId = (req) => {
  const userId = req.user?.id;

  if (!userId) {
    const error = new Error("Authentication required");
    error.status = 401;
    throw error;
  }

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    const error = new Error("Invalid authenticated user id");
    error.status = 400;
    throw error;
  }

  return new mongoose.Types.ObjectId(userId);
};

// GET /analytics/summary
const getSummary = async (req, res) => {
  try {
    const userId = getUserObjectId(req);
    const counts = await History.aggregate([
      {
        $match: {
          user: userId,
          prediction: { $exists: true, $ne: null },
          type: { $exists: true, $ne: null },
          createdAt: { $exists: true, $ne: null }
        }
      },
      { $group: { _id: "$prediction", count: { $sum: 1 } } },
    ]);

    const totalScanned = counts.reduce((sum, { count }) => sum + count, 0);
    let cleanCount = 0, threatCount = 0, unknownCount = 0;
    const labelCounts = {};
    const labelPercentages = {};

    counts.forEach(({ _id: label, count }) => {
      labelCounts[label] = count;
      labelPercentages[label] = pct(count, totalScanned);
      const category = classifyLabel(label);
      if (category === "clean") cleanCount += count;
      else if (category === "threat") threatCount += count;
      else unknownCount += count;
    });

    // Also include unknown counts in the response
    const unknownLabelCount = unknownCount;
    const unknownPercentage = pct(unknownCount, totalScanned);

    res.json({
      totalScanned,
      labelCounts,
      labelPercentages,
      cleanCount,
      cleanPercentage: pct(cleanCount, totalScanned),
      threatCount,
      threatPercentage: pct(threatCount, totalScanned),
      unknownCount: unknownLabelCount,
      unknownPercentage,
    });
  } catch (err) {
    console.error("Analytics summary error:", err);
    res.status(err.status || 500).json({
      error: err.message || "Server error",
    });
  }
};

// GET /analytics/trends?range=daily|weekly|monthly
const getTrends = async (req, res) => {
  try {
    const { range } = req.query;

    if (range !== undefined && !ANALYTICS_RANGES.includes(range)) {
      return res.status(400).json({
        error: `Invalid range value. Supported values are: ${ANALYTICS_RANGES.join(', ')}.`
      });
    }

    // If range is not provided, default to 'daily'
    const selectedRange = range || "daily";

    const userId = getUserObjectId(req);
    const trends = await History.aggregate([
      {
        $match: {
          user: userId,
          prediction: { $exists: true, $ne: null },
          type: { $exists: true, $ne: null },
          createdAt: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: DATE_FORMATS[selectedRange], date: "$createdAt" } },
            label: "$prediction",
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.date": 1 } },
    ]);

    // Map unknown labels to "unknown" for consistency
    const formattedTrends = trends.map(({ _id, count }) => ({
      date: _id.date,
      label: classifyLabel(_id.label) === "unknown" ? "unknown" : _id.label,
      count,
    }));

    res.json(formattedTrends);
  } catch (err) {
    console.error("Analytics trends error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// GET /analytics/breakdown
const getBreakdown = async (req, res) => {
  try {
    const userId = getUserObjectId(req);
    const breakdown = await History.aggregate([
      {
        $match: {
          user: userId,
          prediction: { $exists: true, $ne: null },
          type: { $exists: true, $ne: null },
          createdAt: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: { type: "$type", label: "$prediction" },
          count: { $sum: 1 },
        },
      },
    ]);

    // Map unknown labels to "unknown"
    const formattedBreakdown = breakdown.map(({ _id, count }) => ({
      type: _id.type,
      label: classifyLabel(_id.label) === "unknown" ? "unknown" : _id.label,
      count,
    }));

    res.json(formattedBreakdown);
  } catch (err) {
    console.error("Analytics breakdown error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// GET /analytics/me
const getPersonalSummary = async (req, res) => {
  try {
    const userId = getUserObjectId(req);
    const stats = await History.aggregate([
      {
        $match: {
          user: userId,
          prediction: { $exists: true, $ne: null },
          type: { $exists: true, $ne: null },
          createdAt: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: null,
          total_predictions: { $sum: 1 },
          spam_count: { $sum: { $cond: [{ $eq: ["$prediction", "spam"] }, 1, 0] } },
          ham_count: { $sum: { $cond: [{ $in: ["$prediction", ["ham", "safe"]] }, 1, 0] } },
          smishing_count: { $sum: { $cond: [{ $eq: ["$prediction", "smishing"] }, 1, 0] } },
          malicious_count: { $sum: { $cond: [{ $eq: ["$prediction", "malicious"] }, 1, 0] } },
          offensive_count: { $sum: { $cond: [{ $eq: ["$prediction", "offensive"] }, 1, 0] } },
          unknown_count: {
            $sum: {
              $cond: [{
                $and: [
                  { $ne: ["$prediction", "spam"] },
                  { $ne: ["$prediction", "smishing"] },
                  { $ne: ["$prediction", "malicious"] },
                  { $ne: ["$prediction", "offensive"] },
                  { $not: { $in: ["$prediction", ["ham", "safe"]] } }
                ]
              }, 1, 0]
            }
          },
          most_recent: { $max: "$createdAt" },
        },
      },
    ]);

    const result = stats[0] || {
      total_predictions: 0,
      spam_count: 0,
      ham_count: 0,
      smishing_count: 0,
      malicious_count: 0,
      offensive_count: 0,
      unknown_count: 0,
      most_recent: null,
    };

    res.json(result);
  } catch (err) {
    console.error("Personal analytics error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

module.exports = {
  getSummary,
  getTrends,
  getBreakdown,
  getPersonalSummary,
};