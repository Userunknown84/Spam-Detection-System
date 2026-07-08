const mongoose = require('mongoose');

const ruleSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, "User is required."]
  },
  type: {
    type: String,
    enum: {
      values: ['blacklist', 'whitelist'],
      message: "Type must be either 'blacklist' or 'whitelist'."
    },
    required: [true, "Type is required."]
  },
  // Distinguishes sender-based rules (email/domain) from keyword/phrase rules
  // that match message content. Defaults to 'sender' so existing rules and
  // older API clients keep working unchanged.
  ruleCategory: {
    type: String,
    enum: {
      values: ['sender', 'keyword'],
      message: "Rule category must be either 'sender' or 'keyword'."
    },
    default: 'sender',
    required: [true, "Rule category is required."]
  },
  pattern: {
    type: String,
    required: [true, "Pattern is required."],
    trim: true,
    lowercase: true
  }
}, { timestamps: true });

// Prevent duplicate rules for the same user (scoped per category)
ruleSchema.index({ user: 1, ruleCategory: 1, type: 1, pattern: 1 }, { unique: true });

module.exports = mongoose.model('Rule', ruleSchema);