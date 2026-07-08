const mongoose = require('mongoose');

// Assuming your original History model has similar fields. Adjust if needed!
const historyArchiveSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    message: { type: String, required: true },
    prediction: { type: String, required: true },
    confidenceScore: { type: Number },
    createdAt: { type: Date, default: Date.now }
}, {
    timestamps: true,
    collection: 'history_archive' // Explicitly naming the cold storage collection
});

module.exports = mongoose.model('HistoryArchive', historyArchiveSchema);