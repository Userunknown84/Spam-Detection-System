const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

// GET /api/predictions/stats
router.get('/stats', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get predictions from database
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