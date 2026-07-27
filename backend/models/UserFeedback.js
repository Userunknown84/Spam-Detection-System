const mongoose = require('mongoose');

const UserFeedbackSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true },
  predicted_label: { type: String, required: true },
  correct_label: { type: String, required: true },
  sender: { type: String },
  confidence: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('UserFeedback', UserFeedbackSchema);