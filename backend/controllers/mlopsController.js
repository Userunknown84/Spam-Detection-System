const History = require('../models/History');
const config = require('../config/mlops.config');
const logger = require('../utils/logger');

exports.checkModelDrift = async (req, res) => {
  try {
    const {
      analysisWindowDays = config.driftAnalysis.analysisWindowDays,
      accuracyThreshold = config.driftAnalysis.accuracyThreshold,
      minDataPoints = config.driftAnalysis.minDataPoints
    } = req.query;

    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - parseInt(analysisWindowDays));

    const totalPredictions = await History.countDocuments({ 
      createdAt: { $gte: daysAgo } 
    });
    
    const correctedPredictions = await History.countDocuments({
      createdAt: { $gte: daysAgo },
      feedback: { $exists: true } 
    });

    if (totalPredictions < minDataPoints) {
        return res.json({ 
            success: true, 
            status: "Insufficient Data", 
            message: `Not enough prediction data (${totalPredictions}/${minDataPoints} required) in the last ${analysisWindowDays} days.`,
            requiredDataPoints: minDataPoints,
            currentDataPoints: totalPredictions,
            timeWindow: `${analysisWindowDays} Days`
        });
    }

    const accuracy = ((totalPredictions - correctedPredictions) / totalPredictions) * 100;
    const isDegrading = accuracy < accuracyThreshold;

    let status = "Stable";
    let recommendation = "✅ Model is performing optimally.";
    let alertLevel = "info";

    if (accuracy < config.driftAnalysis.criticalThreshold) {
      status = "Critical";
      recommendation = "🚨 CRITICAL: Model accuracy dropped below critical threshold. Immediate retraining required!";
      alertLevel = "critical";
    } else if (accuracy < config.driftAnalysis.alertThreshold) {
      status = "Warning";
      recommendation = "⚠️ ALERT: Model accuracy dropped below alert threshold. Retraining recommended soon.";
      alertLevel = "warning";
    } else if (isDegrading) {
      status = "Degrading";
      recommendation = "⚠️ Model accuracy is degrading. Monitor closely.";
      alertLevel = "warning";
    }

    const response = {
      success: true,
      driftDetected: isDegrading || accuracy < config.driftAnalysis.alertThreshold,
      status: status,
      alertLevel: alertLevel,
      metrics: {
        timeWindow: `Last ${analysisWindowDays} Days`,
        totalPredictions,
        totalCorrections: correctedPredictions,
        currentAccuracy: `${accuracy.toFixed(2)}%`,
        threshold: `${accuracyThreshold}%`,
        alertThreshold: `${config.driftAnalysis.alertThreshold}%`,
        criticalThreshold: `${config.driftAnalysis.criticalThreshold}%`,
        minDataPointsRequired: minDataPoints,
        analysisWindowDays: parseInt(analysisWindowDays)
      },
      recommendation: recommendation,
      config: {
        autoRetrainEnabled: config.driftAnalysis.enableAutoRetrain,
        notificationEnabled: config.driftAnalysis.notificationEnabled,
        checkIntervalHours: config.monitoring.checkInterval
      }
    };

    logger.info('Model drift check completed', {
      accuracy: accuracy.toFixed(2),
      status,
      alertLevel,
      totalPredictions
    });

    res.json(response);

  } catch (error) {
    console.error("Drift Check Error:", error.message);
    logger.error('Drift check error:', error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to run model drift analysis.",
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

exports.getModelMetrics = async (req, res) => {
  try {
    const days = parseInt(req.query.days) || config.monitoring.maxHistoryDays;
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - days);

    const totalPredictions = await History.countDocuments({
      createdAt: { $gte: daysAgo }
    });

    const corrections = await History.countDocuments({
      createdAt: { $gte: daysAgo },
      feedback: { $exists: true }
    });

    const accuracy = totalPredictions > 0 
      ? ((totalPredictions - corrections) / totalPredictions) * 100 
      : 0;

    res.json({
      success: true,
      data: {
        totalPredictions,
        corrections,
        accuracy: `${accuracy.toFixed(2)}%`,
        timeWindow: `${days} Days`,
        config: config.driftAnalysis
      }
    });
  } catch (error) {
    logger.error('Model metrics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get model metrics'
    });
  }
};

exports.getDriftHistory = async (req, res) => {
  try {
    const { limit = 20, page = 1 } = req.query;
    const limitNum = Math.min(parseInt(limit) || 20, 100);
    const pageNum = Math.max(parseInt(page) || 1, 1);
    const skip = (pageNum - 1) * limitNum;

    const history = await History.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await History.countDocuments();

    res.json({
      success: true,
      data: history,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    logger.error('Drift history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get drift history'
    });
  }
};

exports.getConfig = async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        driftAnalysis: config.driftAnalysis,
        monitoring: config.monitoring
      }
    });
  } catch (error) {
    logger.error('Config error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get configuration'
    });
  }
};

exports.updateConfig = async (req, res) => {
  try {
    const { analysisWindowDays, accuracyThreshold, minDataPoints, alertThreshold, criticalThreshold } = req.body;

    const updates = {};
    if (analysisWindowDays) updates.analysisWindowDays = parseInt(analysisWindowDays);
    if (accuracyThreshold) updates.accuracyThreshold = parseFloat(accuracyThreshold);
    if (minDataPoints) updates.minDataPoints = parseInt(minDataPoints);
    if (alertThreshold) updates.alertThreshold = parseFloat(alertThreshold);
    if (criticalThreshold) updates.criticalThreshold = parseFloat(criticalThreshold);

    Object.assign(config.driftAnalysis, updates);

    logger.info('Drift configuration updated', updates);

    res.json({
      success: true,
      message: 'Configuration updated successfully',
      data: config.driftAnalysis
    });
  } catch (error) {
    logger.error('Update config error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update configuration'
    });
  }
};