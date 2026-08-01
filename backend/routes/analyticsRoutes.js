const express = require("express");
const router = express.Router();

const { checkModelDrift } = require('../controllers/mlopsController');

const {
  getSummary,
  getTrends,
  getBreakdown,
  getPersonalSummary,
} = require("../controllers/analyticsController");

const { protect } = require("../middleware/authMiddleware");
const UserFeedback = require('../models/UserFeedback');

router.use(protect);
router.get("/summary", getSummary);
router.get("/trends", getTrends);
router.get("/breakdown", getBreakdown);
router.get('/model-drift', checkModelDrift);
router.get("/me", getPersonalSummary);

// @desc    Model accuracy derived from user feedback (predicted vs. corrected label)
// @route   GET /api/v1/analytics/accuracy
router.get('/accuracy', async (req, res) => {
  try {
    const feedback = await UserFeedback.find({ userId: req.user.id });

    const total = feedback.length;
    const correct = feedback.filter((f) => f.predicted_label === f.correct_label).length;
    const incorrect = total - correct;

    res.json({
      accuracy: total > 0 ? Math.round((correct / total) * 100) : 0,
      total,
      correct,
      incorrect,
    });
  } catch (error) {
    console.error('Accuracy error:', error);
    res.status(500).json({ error: 'Failed to fetch accuracy' });
  }
});

module.exports = router;
