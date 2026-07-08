const mongoose = require("mongoose");
const History = require("../models/History");

const DATE_FORMATS = {
  daily: "%Y-%m-%d",
  weekly: "%Y-%U",
  monthly: "%Y-%m",
};

const ANALYTICS_RANGES = Object.keys(DATE_FORMATS);

// Labels the ML API returns for a clean verdict (text -> "ham", url -> "safe").
// Everything else ("spam", "smishing", "malicious", "offensive", ...) counts as a threat.
const CLEAN_LABELS = new Set(["ham", "safe"]);

const pct = (count, total) => (total ? Number(((count / total) * 100).toFixed(2)) : 0);

const getUserObjectId = (req) => {
  return new mongoose.Types.ObjectId(req.user.id)
}

// GET /analytics/summary
const getSummary = async (req, res) => {
  try {
    const userId = getUserObjectId(req);
    const counts = await History.aggregate([
      { $match: { user: userId } },
      { $group: { _id: "$prediction", count: { $sum: 1 } } },
    ]);

    const totalScanned = counts.reduce((sum, { count }) => sum + count, 0);
    const labelCounts = {};
    const labelPercentages = {};
    let cleanCount = 0;

    counts.forEach(({ _id: label, count }) => {
      labelCounts[label] = count;
      labelPercentages[label] = pct(count, totalScanned);
      if (CLEAN_LABELS.has(label)) cleanCount += count;
    });

    const threatCount = totalScanned - cleanCount;

    res.json({
      totalScanned,
      labelCounts,
      labelPercentages,
      cleanCount,
      cleanPercentage: pct(cleanCount, totalScanned),
      threatCount,
      threatPercentage: pct(threatCount, totalScanned),
    });
  } catch (err) {
    console.error("Analytics summary error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// GET /analytics/trends?range=daily|weekly|monthly
const getTrends = async (req, res) => {
  try {
    const range = ANALYTICS_RANGES.includes(req.query.range)
      ? req.query.range
      : "daily";

    const userId = getUserObjectId(req);
    const trends = await History.aggregate([
      { $match: { user: userId } },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: DATE_FORMATS[range], date: "$createdAt" } },
            label: "$prediction",
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.date": 1 } },
    ]);

    res.json(
      trends.map(({ _id, count }) => ({
        date: _id.date,
        label: _id.label,
        count,
      })),
    );
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
      { $match: { user: userId } },
      {
        $group: {
          _id: { type: "$type", label: "$prediction" },
          count: { $sum: 1 },
        },
      },
    ]);

    res.json(
      breakdown.map(({ _id, count }) => ({
        type: _id.type,
        label: _id.label,
        count,
      })),
    );
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
      { $match: { user: userId } },
      {
        $group: {
          _id: null,
          total_predictions: { $sum: 1 },
          spam_count: { $sum: { $cond: [{ $eq: ["$prediction", "spam"] }, 1, 0] } },
          ham_count: { $sum: { $cond: [{ $in: ["$prediction", ["ham", "safe"]] }, 1, 0] } },
          smishing_count: { $sum: { $cond: [{ $eq: ["$prediction", "smishing"] }, 1, 0] } },
          most_recent: { $max: "$createdAt" },
        },
      },
    ]);

    const result = stats[0] || {
      total_predictions: 0,
      spam_count: 0,
      ham_count: 0,
      smishing_count: 0,
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

