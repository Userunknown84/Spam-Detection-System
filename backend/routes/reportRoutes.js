const express = require('express');
const { exportReport } = require('../controllers/reportController');
const router = express.Router();

// Simple route - no missing handler
router.get('/export-pdf',exportReport);

module.exports = router;
