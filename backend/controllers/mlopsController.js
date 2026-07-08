const History = require('../models/History');

exports.checkModelDrift = async (req, res) => {
  try {
    // 7-day rolling window set kar rahe hain
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Total predictions aur Total user corrections nikalenge
    const totalPredictions = await History.countDocuments({ createdAt: { $gte: sevenDaysAgo } });
    
    // Agar 'feedback' field exist karti hai, matlab user ne correct kiya hai (Prediction wrong thi)
    const correctedPredictions = await History.countDocuments({
      createdAt: { $gte: sevenDaysAgo },
      feedback: { $exists: true } 
    });

    // Edge case: Agar last 7 days mein koi data hi nahi hai
    if (totalPredictions === 0) {
        return res.json({ 
            success: true, 
            status: "Neutral", 
            message: "Not enough prediction data in the last 7 days." 
        });
    }

    // Accuracy Calculation: (Total - Corrections) / Total
    const accuracy = ((totalPredictions - correctedPredictions) / totalPredictions) * 100;
    
    // Threshold check (maintainer ki requirement 85% thi)
    const isDegrading = accuracy < 85;

    res.json({
      success: true,
      driftDetected: isDegrading,
      metrics: {
        timeWindow: "Last 7 Days",
        totalPredictions,
        totalCorrections: correctedPredictions,
        currentAccuracy: `${accuracy.toFixed(2)}%`,
        threshold: "85%"
      },
      recommendation: isDegrading 
        ? "⚠️ ALERT: Model accuracy dropped below 85%. Retraining recommended." 
        : "✅ Model is performing optimally."
    });

  } catch (error) {
    console.error("Drift Check Error:", error.message);
    res.status(500).json({ success: false, error: "Failed to run model drift analysis." });
  }
};