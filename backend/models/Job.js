const mongoose = require('mongoose');

const JobSchema = new mongoose.Schema({
  _id: {
    type: String, // BullMQ Job ID
    required: true,
  },
  type: {
    type: String,
    required: true,
    enum: ['bulk-predict'],
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending',
  },
  progress: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  result: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  error: {
    type: String,
    default: null,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
}, { 
  timestamps: true 
});

// Retention policy: automatically delete documents 7 days after creation
JobSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

module.exports = mongoose.model('Job', JobSchema);
