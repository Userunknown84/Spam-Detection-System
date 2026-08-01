const axios = require("axios");
const { mlCircuitBreaker } = require("../utils/circuitBreaker");
const { getFallbackPrediction } = require("../utils/fallbackDetector");
const logger = require("../utils/logger");

// Concurrent Flask calls per batch - bulk CSVs can carry up to MAX_CSV_ROWS
// rows (100k by default), so firing them all at once would overwhelm the ML
// API; a small concurrency window keeps throughput reasonable without that
// risk.
const BATCH_CONCURRENCY = Number(process.env.BULK_PREDICT_CONCURRENCY) || 5;

function resolveApiUrl() {
  let apiUrl =
    process.env.VITE_ML_API_URI ||
    process.env.API ||
    "http://localhost:5000/predict";
  return apiUrl.replace(/\/predict\/?$/, "").replace(/\/$/, "") + "/predict";
}

async function predictOne(row, apiUrl) {
  const text = row.text;
  const type = (row.type || "message").toString().toLowerCase();

  const requestFn = () =>
    axios.post(
      apiUrl,
      { text, type },
      { timeout: Number(process.env.ML_API_TIMEOUT_MS) || 15000 }
    );

  const fallbackFn = (error) => {
    logger.warn(`Bulk predict: circuit breaker fallback for one row - ${error.message}`);
    return { data: getFallbackPrediction(text, type) };
  };

  try {
    const response = await mlCircuitBreaker.fire(requestFn, fallbackFn);
    return {
      text,
      prediction: response.data.prediction,
      confidence: response.data.confidence ?? response.data.probability ?? null,
    };
  } catch (error) {
    return { text, error: error.message || "Prediction failed" };
  }
}

/**
 * Runs a spam/ham prediction for each validated CSV row against the ML API,
 * processing BATCH_CONCURRENCY rows at a time. A failure on one row (a
 * timeout, a circuit-breaker trip that also fails, etc.) is captured on that
 * row's result rather than aborting the whole batch.
 */
async function processBulkPrediction(rows) {
  const apiUrl = resolveApiUrl();
  const results = [];

  for (let i = 0; i < rows.length; i += BATCH_CONCURRENCY) {
    const batch = rows.slice(i, i + BATCH_CONCURRENCY);
    const batchResults = await Promise.all(batch.map((row) => predictOne(row, apiUrl)));
    results.push(...batchResults);
  }

  return results;
}

module.exports = { processBulkPrediction };
