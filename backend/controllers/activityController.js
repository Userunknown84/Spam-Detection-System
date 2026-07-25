// backend/controllers/activityController.js
const mongoose = require('mongoose');
const History = require('../models/History');
<<<<<<< Updated upstream
const { replacements, tonePrefixes } = require('../utils/despamificationRules');
=======

>>>>>>> Stashed changes
// ==================== DE-SPAMIFICATION LOGIC ====================
exports.despamify = async (req, res) => {
  try {
    const { text, tone = 'neutral' } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    // Simple de-spamification logic
    let deSpammed = text;

<<<<<<< Updated upstream
=======
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
>>>>>>> Stashed changes

    const prefix = tonePrefixes[tone] || '';

    for (const [key, value] of Object.entries(replacements)) {
      deSpammed = deSpammed.replace(new RegExp(key, 'gi'), value);
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
};

// ==================== USER STATISTICS LOGIC ====================
exports.getStats = async (req, res) => {
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
};

// ==================== USER ACTIVITY HEATMAP LOGIC ====================
<<<<<<< Updated upstream
=======
// ==================== USER ACTIVITY HEATMAP LOGIC ====================
>>>>>>> Stashed changes
exports.getActivity = async (req, res) => {
  try {
    const { userId } = req.params;
    const { year, month } = req.query;

<<<<<<< Updated upstream
    const yearNum = parseInt(year, 10);
    const monthNum = parseInt(month, 10);

    if (!year || isNaN(yearNum)) {
      return res.status(400).json({ error: "Valid year query parameter (number) is required." });
    }
    if (!month || isNaN(monthNum)) {
      return res.status(400).json({ error: "Valid month query parameter (number) is required." });
    }
    if (monthNum < 1 || monthNum > 12) {
      return res.status(400).json({ error: "Month must be between 1 and 12." });
    }

=======
>>>>>>> Stashed changes
    // Validate user id format before using it in aggregation
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Invalid user id" });
    }

    // Ensure logged-in users can only access their own activity data
    if (userId !== req.user.id) {
      return res.status(403).json({
        error: "Unauthorized access to activity data",
      });
    }

<<<<<<< Updated upstream
    const startDate = new Date(yearNum, monthNum - 1, 1);
    const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59, 999);
=======
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);
>>>>>>> Stashed changes

    const activities = await History.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: {
            day: { $dayOfMonth: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
    ]);

    const result = {};
    activities.forEach((item) => {
      result[`${item._id.month}-${item._id.day}`] = item.count;
    });

    res.json(result);
  } catch (error) {
    console.error("Error fetching activity data:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
};