const mongoose = require('mongoose');
const safeRegex = require('safe-regex');

const adminRuleSchema = new mongoose.Schema(
  {
    pattern: {
      type: String,
      required: [true, 'Pattern is required'],
      trim: true,
      validate: {
        validator: function (value) {
          if (this.type === 'regex') {
            try {
              new RegExp(value); // Syntax check
              return safeRegex(value); // ReDoS check
            } catch (e) {
              return false;
            }
          }
          return true;
        },
        message: 'Invalid regex pattern or pattern is susceptible to ReDoS.'
      }
    },
    type: {
      type: String,
      enum: {
        values: ['regex', 'keyword', 'domain', 'url', 'email'],
        message: '{VALUE} is not a valid rule type'
      },
      required: [true, 'Type is required']
    },
    action: {
      type: String,
      enum: {
        values: ['spam', 'ham', 'smishing', 'malicious', 'safe'],
        message: '{VALUE} is not a valid action'
      },
      required: [true, 'Action is required']
    },
    enabled: {
      type: Boolean,
      default: true
    },
    priority: {
      type: Number,
      default: 0
    },
    description: {
      type: String,
      trim: true,
      default: ''
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    timestamps: true
  }
);

// Compound index to support evaluation query and deterministic fallback (createdAt desc)
adminRuleSchema.index({ enabled: 1, priority: -1, createdAt: -1 });

module.exports = mongoose.model('AdminRule', adminRuleSchema);
