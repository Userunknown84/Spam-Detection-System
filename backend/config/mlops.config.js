const config = {
  driftAnalysis: {
    analysisWindowDays: parseInt(process.env.DRIFT_ANALYSIS_WINDOW_DAYS) || 7,
    accuracyThreshold: parseFloat(process.env.DRIFT_ACCURACY_THRESHOLD) || 85,
    minDataPoints: parseInt(process.env.DRIFT_MIN_DATA_POINTS) || 10,
    alertThreshold: parseFloat(process.env.DRIFT_ALERT_THRESHOLD) || 80,
    criticalThreshold: parseFloat(process.env.DRIFT_CRITICAL_THRESHOLD) || 70,
    enableAutoRetrain: process.env.DRIFT_ENABLE_AUTO_RETRAIN === 'true',
    notificationEnabled: process.env.DRIFT_NOTIFICATION_ENABLED !== 'false'
  },
  monitoring: {
    checkInterval: parseInt(process.env.DRIFT_CHECK_INTERVAL_HOURS) || 24,
    maxHistoryDays: parseInt(process.env.DRIFT_MAX_HISTORY_DAYS) || 90,
    batchSize: parseInt(process.env.DRIFT_BATCH_SIZE) || 1000
  }
};

module.exports = config;