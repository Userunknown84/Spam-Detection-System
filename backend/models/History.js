const mongoose = require("mongoose");
const { 
  PREDICTION_TYPES, 
  PREDICTION_TYPE_LIST,
  isValidPredictionType,
  getPredictionTypeLabel,
  getPredictionTypeDescription
} = require("../constants/predictionTypes");

const historySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required."],
    },
    query: {
      type: String,
      required: [true, "Query is required."],
      trim: true,
      maxlength: [10000, "Query cannot exceed 10000 characters"],
    },
    prediction: {
      type: String,
      required: [true, "Prediction is required."],
      enum: {
        values: ["ham", "spam"],
        message: "Prediction must be either 'ham' or 'spam'"
      },
      default: "ham"
    },
    type: {
      type: String,
      required: [true, "Type is required."],
      enum: {
        values: PREDICTION_TYPE_LIST,
        message: `Type must be one of: ${PREDICTION_TYPE_LIST.join(', ')}`,
      },
      default: PREDICTION_TYPES.MESSAGE
    },
    confidence: {
      type: Number,
      min: [0, "Confidence cannot be less than 0"],
      max: [1, "Confidence cannot be greater than 1"],
      default: 0
    },
    feedback: {
      label: {
        type: String,
        enum: {
          values: ["correct", "incorrect"],
          message: "Feedback must be either 'correct' or 'incorrect'"
        }
      },
      note: {
        type: String,
        trim: true,
        maxlength: [500, "Feedback note cannot exceed 500 characters"]
      },
      submittedAt: {
        type: Date
      }
    },
    ipAddress: {
      type: String,
      trim: true
    },
    userAgent: {
      type: String,
      trim: true
    },
    processingTime: {
      type: Number,
      min: 0
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  { timestamps: true }
);

historySchema.index({ user: 1, createdAt: -1 }, { background: true });
historySchema.index({ user: 1, prediction: 1 }, { background: true });
historySchema.index({ user: 1, type: 1 }, { background: true });
historySchema.index({ prediction: 1 });
historySchema.index({ type: 1 });
historySchema.index({ "feedback.label": 1 });
historySchema.index({ createdAt: -1 });

historySchema.virtual('typeLabel').get(function() {
  return getPredictionTypeLabel(this.type);
});

historySchema.virtual('typeDescription').get(function() {
  return getPredictionTypeDescription(this.type);
});

historySchema.virtual('isSpam').get(function() {
  return this.prediction === 'spam';
});

historySchema.virtual('isHam').get(function() {
  return this.prediction === 'ham';
});

historySchema.statics.getByType = function(userId, type, limit = 100) {
  if (!isValidPredictionType(type)) {
    throw new Error(`Invalid prediction type: ${type}`);
  }
  const query = { type };
  if (userId) query.user = userId;
  return this.find(query).sort({ createdAt: -1 }).limit(limit);
};

historySchema.statics.getSummary = function(userId) {
  return this.aggregate([
    { $match: { user: userId } },
    {
      $group: {
        _id: '$prediction',
        count: { $sum: 1 },
        avgConfidence: { $avg: '$confidence' }
      }
    }
  ]);
};

historySchema.statics.getTypeBreakdown = function(userId) {
  return this.aggregate([
    { $match: { user: userId } },
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 },
        spamCount: {
          $sum: { $cond: [{ $eq: ['$prediction', 'spam'] }, 1, 0] }
        },
        hamCount: {
          $sum: { $cond: [{ $eq: ['$prediction', 'ham'] }, 1, 0] }
        }
      }
    }
  ]);
};

historySchema.statics.getTrends = function(userId, days = 7) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  
  return this.aggregate([
    {
      $match: {
        user: userId,
        createdAt: { $gte: date }
      }
    },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          prediction: "$prediction"
        },
        count: { $sum: 1 }
      }
    },
    {
      $group: {
        _id: "$_id.date",
        spam: {
          $sum: { $cond: [{ $eq: ["$_id.prediction", "spam"] }, "$count", 0] }
        },
        ham: {
          $sum: { $cond: [{ $eq: ["$_id.prediction", "ham"] }, "$count", 0] }
        }
      }
    },
    { $sort: { _id: 1 } }
  ]);
};

historySchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.__v;
  obj.typeLabel = this.typeLabel;
  obj.typeDescription = this.typeDescription;
  return obj;
};

module.exports = mongoose.model("History", historySchema);