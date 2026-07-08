const express = require('express');
const router = express.Router();
const { getHealthStatus } = require('../utils/healthCheck');

// ===== SIMPLE HEALTH ENDPOINT =====
router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Server is running',
    limit: '1MB'
  });
});

// ===== ADVANCED HEALTH ENDPOINT =====
router.get('/detailed', async (req, res) => {
  try {
    const healthStatus = await getHealthStatus();
    const statusCode = healthStatus.status === "healthy" ? 200 : 503;
    res.status(statusCode).json(healthStatus);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve health status',
      error: error.message
    });
  }
});

module.exports = router;