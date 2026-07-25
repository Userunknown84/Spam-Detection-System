const { processBulkPrediction } = require("../services/bulkPredictService");
<<<<<<< Updated upstream
const logger = require("../utils/logger");

const MAX_TEXT_LENGTH = 10000;
const MIN_TEXT_LENGTH = 2;
=======
>>>>>>> Stashed changes

/**
 * Extract a usable prediction text value from a CSV row.
 * Supports common bulk-predict column names such as "text" or "message".
 */
const getPredictionInputFromRow = (row) => {
  if (!row || typeof row !== "object") return null;

  const rowEntries = Object.entries(row);
  const textEntry = rowEntries.find(([key]) =>
<<<<<<< Updated upstream
    ["text", "message", "content", "email", "sms", "tweet"].includes(key.trim().toLowerCase())
=======
    ["text", "message"].includes(key.trim().toLowerCase())
>>>>>>> Stashed changes
  );

  if (!textEntry) return null;

  const value = textEntry[1];
  if (typeof value !== "string") return null;

  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue : null;
};

/**
 * Validate parsed CSV rows before forwarding them to the bulk prediction service.
 * Returns normalized rows if valid, otherwise returns an error response.
 */
const validateBulkPredictionRows = (rows, res) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({
      success: false,
      error: "CSV contains no prediction rows.",
    });
    return null;
  }

  const normalizedRows = [];
<<<<<<< Updated upstream
  const errors = [];
=======
>>>>>>> Stashed changes

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];

    if (!row || typeof row !== "object" || Array.isArray(row)) {
<<<<<<< Updated upstream
      errors.push({
        row: index + 2,
        error: "Row is not a valid CSV record."
      });
      continue;
=======
      res.status(400).json({
        success: false,
        error: `Row ${index + 2} is not a valid CSV record.`,
      });
      return null;
>>>>>>> Stashed changes
    }

    const predictionInput = getPredictionInputFromRow(row);

    if (!predictionInput) {
<<<<<<< Updated upstream
      errors.push({
        row: index + 2,
        error: "Row is missing valid text content."
      });
      continue;
    }

    if (predictionInput.length < MIN_TEXT_LENGTH) {
      errors.push({
        row: index + 2,
        error: `Text content too short. Minimum ${MIN_TEXT_LENGTH} characters required.`
      });
      continue;
    }

    if (predictionInput.length > MAX_TEXT_LENGTH) {
      errors.push({
        row: index + 2,
        error: `Text content too long. Maximum ${MAX_TEXT_LENGTH} characters allowed.`
      });
      continue;
=======
      res.status(400).json({
        success: false,
        error: `Row ${index + 2} is missing valid text content.`,
      });
      return null;
>>>>>>> Stashed changes
    }

    normalizedRows.push({
      ...row,
      text: predictionInput,
    });
  }

<<<<<<< Updated upstream
  if (errors.length > 0) {
    const errorSummary = {
      totalRows: rows.length,
      validRows: normalizedRows.length,
      invalidRows: errors.length,
      errors: errors.slice(0, 10)
    };

    res.status(400).json({
      success: false,
      error: "Row validation failed",
      details: errorSummary
    });
    return null;
  }

=======
>>>>>>> Stashed changes
  return normalizedRows;
};

exports.handleBulkPrediction = async (req, res) => {
  try {
    if (!req.parsedFile) {
      return res.status(400).json({
        success: false,
        error: 'File could not be parsed. Please ensure a valid CSV, PDF, or DOCX file is uploaded.'
      });
    }

    const { rows, filename, size } = req.parsedFile;

<<<<<<< Updated upstream
    logger.info(`Bulk prediction requested: ${filename}, ${rows.length} rows`);

    const validatedRows = validateBulkPredictionRows(rows, res);
    
    if (!validatedRows) {
      return;
    }

    const results = await processBulkPrediction(validatedRows);

    logger.info(`Bulk prediction completed: ${filename}, ${validatedRows.length} rows processed`);
=======
    // Process predictions
    const results = await processBulkPrediction(rows);
>>>>>>> Stashed changes

    res.json({
      success: true,
      totalRows: rows.length,
<<<<<<< Updated upstream
      validRows: validatedRows.length,
      invalidRows: rows.length - validatedRows.length,
=======
>>>>>>> Stashed changes
      filename: filename,
      size: size,
      results: results
    });
  } catch (error) {
    console.error('Bulk prediction error:', error);
<<<<<<< Updated upstream
    logger.error('Bulk prediction error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process bulk prediction',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
=======
    res.status(500).json({
      success: false,
      error: 'Failed to process bulk prediction',
      details: error.message
>>>>>>> Stashed changes
    });
  }
};

exports.downloadBulkPredictTemplate = (req, res) => {
  const template = 'text,label\n"Your message here",""\n"Another message",""';
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="bulk_predict_template.csv"');
  res.send(template);
};