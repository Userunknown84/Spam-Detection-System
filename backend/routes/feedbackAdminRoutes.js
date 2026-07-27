const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/authMiddleware');
const History = require('../models/History');

router.use(protect);
router.use(admin);

// @desc    Get aggregated feedback stats for admin
// @route   GET /api/v1/feedback/admin/stats
// @access  Private/Admin
router.get('/stats', async (req, res) => {
  try {
    const totalPredictions = await History.countDocuments();
    const totalFeedback = await History.countDocuments({ 'feedback.label': { $exists: true } });
    const correctFeedback = await History.countDocuments({ 'feedback.label': 'correct' });
    const incorrectFeedback = await History.countDocuments({ 'feedback.label': 'incorrect' });
    
    // False Positives: predicted 'spam', but user marked it as 'incorrect' (i.e. it was actually ham)
    const falsePositives = await History.countDocuments({ 
      prediction: 'spam', 
      'feedback.label': 'incorrect' 
    });

    // False Negatives: predicted 'ham', but user marked it as 'incorrect' (i.e. it was actually spam)
    const falseNegatives = await History.countDocuments({ 
      prediction: 'ham', 
      'feedback.label': 'incorrect' 
    });

    const participationRate = totalPredictions > 0 ? (totalFeedback / totalPredictions) * 100 : 0;
    const correctRate = totalFeedback > 0 ? (correctFeedback / totalFeedback) * 100 : 0;
    const incorrectRate = totalFeedback > 0 ? (incorrectFeedback / totalFeedback) * 100 : 0;

    res.json({
      totalPredictions,
      totalFeedback,
      participationRate: Math.round(participationRate * 100) / 100,
      correctFeedback,
      correctRate: Math.round(correctRate * 100) / 100,
      incorrectFeedback,
      incorrectRate: Math.round(incorrectRate * 100) / 100,
      falsePositives,
      falseNegatives
    });
  } catch (error) {
    console.error(`[${req.requestId}] Admin feedback stats error:`, error.message);
    res.status(500).json({ error: 'Failed to fetch feedback stats' });
  }
});

// @desc    Get paginated feedback list for admin
// @route   GET /api/v1/feedback/admin/list
// @access  Private/Admin
router.get('/list', async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const startIndex = (page - 1) * limit;

    const query = { 'feedback.label': { $exists: true } };

    const total = await History.countDocuments(query);
    const feedbackList = await History.find(query)
      .sort({ 'feedback.submittedAt': -1, createdAt: -1 })
      .skip(startIndex)
      .limit(limit)
      .populate('user', 'name email');

    res.json({
      success: true,
      count: feedbackList.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: feedbackList
    });
  } catch (error) {
    console.error(`[${req.requestId}] Admin feedback list error:`, error.message);
    res.status(500).json({ error: 'Failed to fetch feedback list' });
  }
});

module.exports = router;
