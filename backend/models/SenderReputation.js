const mongoose = require('mongoose');

const SenderReputationSchema = new mongoose.Schema({
  email: { type: String, required: true, index: true },
  domain: { type: String, required: true, index: true },
  score: { type: Number, default: 50, min: 0, max: 100 },
  spamReports: { type: Number, default: 0 },
  hamReports: { type: Number, default: 0 },
  lastSeen: { type: Date, default: Date.now }
});

SenderReputationSchema.methods.recordHam = function() {
  this.hamReports += 1;
  this.score = Math.min(100, this.score + 2);
  return this.save();
};

SenderReputationSchema.methods.recordSpam = function() {
  this.spamReports += 1;
  this.score = Math.max(0, this.score - 5);
  return this.save();
};

SenderReputationSchema.methods.getLevel = function() {
  if (this.score >= 70) return 'trusted';
  if (this.score >= 40) return 'neutral';
  return 'suspicious';
};

module.exports = mongoose.model('SenderReputation', SenderReputationSchema);