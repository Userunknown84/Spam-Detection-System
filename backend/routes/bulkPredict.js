const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { validateCSVUpload } = require('../middleware/fileValidation');
const { bulkPredictLimiter } = require('../middleware/rateLimiter');
const { processBulkPrediction, handleBulkPrediction, downloadBulkPredictTemplate } = require('../controllers/bulkPredictController');

/**
 * @route   POST /api/bulk-predict
 * @desc    Upload CSV for bulk prediction
 * @access  Private
 */
router.post(
    '/bulk-predict',
    protect,
    bulkPredictLimiter,
    validateCSVUpload, // <-- NEW: File validation middleware
    handleBulkPrediction
);

/**
 * @route   GET /api/bulk-predict/template
 * @desc    Download CSV template
 * @access  Private
 */
router.get('/bulk-predict/template', downloadBulkPredictTemplate);

module.exports = router;