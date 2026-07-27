const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const Feedback = require('../models/Feedback');


router.post('/feedback', protect, async (req, res) => {
  try {
    const { text, predicted_label, correct_label } = req.body;
    
    if (!text || !correct_label) {
      return res.status(400).json({ error: 'text and correct_label are required' });
    }
    
    const feedback = new Feedback({
      userId: req.user.id,
      text,
      predicted_label,
      correct_label,
      type: 'user_feedback'
    });
    
    await feedback.save();
    res.status(201).json({ message: 'Feedback recorded. Thank you!' });
  } catch (error) {
    console.error('Feedback error:', error);
    res.status(500).json({ error: 'Failed to save feedback' });
  }
});


router.post('/false-positive', protect, async (req, res) => {
  try {
    const { text, predicted_label, correct_label } = req.body;
    
    const feedback = new Feedback({
      userId: req.user.id,
      text,
      predicted_label,
      correct_label: correct_label || 'ham',
      type: 'false_positive'
    });
    
    await feedback.save();
    res.json({ success: true, message: 'Feedback recorded' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save feedback' });
  }
});

module.exports = router;