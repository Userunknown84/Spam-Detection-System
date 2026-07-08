const errorCodes = {
    // Auth errors
    UNAUTHORIZED: "UNAUTHORIZED",
    FORBIDDEN: "FORBIDDEN",
    INVALID_TOKEN: "INVALID_TOKEN",

    // Input errors
    INVALID_INPUT: "INVALID_INPUT",
    MISSING_FIELD: "MISSING_FIELD",
    VALIDATION_ERROR: "VALIDATION_ERROR",

    // Resource errors
    NOT_FOUND: "NOT_FOUND",
    ALREADY_EXISTS: "ALREADY_EXISTS",

    // Server errors
    INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
    SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",

    // ML API errors
    ML_SERVICE_UNAVAILABLE: "ML_SERVICE_UNAVAILABLE",
    ML_TIMEOUT: "ML_TIMEOUT",
    ML_SERVICE_ERROR: "ML_SERVICE_ERROR",

    // Payload errors
    PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
};

const ML_ERROR_MESSAGES = {
    INVALID_INPUT: "The analysis service rejected the request.",
    SERVICE_ERROR: "The analysis service encountered an error. Please try again.",
    TIMEOUT: "The analysis service took too long to respond. Please try again.",
    UNAVAILABLE:
        "The analysis service is currently unavailable. Please try again in a moment.",
};

// Standard error formatter
const formatError = (code, message, details = null) => {
    const error = {
        code,
        message,
    };

    if (details) {
        error.details = details;
    }

    return error;
};

// Classify an error thrown while calling the Python ML API (via axios) into a
// structured HTTP status + body. Distinguishes timeouts, connection failures,
// upstream 5xx, and upstream 4xx so the frontend can show specific messaging.
// The body keeps the `error` field used elsewhere in the app, plus a machine
// readable `code` and a `retryable` flag for the UI's retry affordance.
const classifyMlApiError = (error) => {
    // The ML service responded with an error status.
    if (error.response) {
        const status = error.response.status;
        const upstreamMessage =
            error.response.data && error.response.data.error;

        // 4xx -> the request itself was invalid; forward it, not retryable.
        if (status >= 400 && status < 500) {
            return {
                status,
                body: {
                    error: upstreamMessage || ML_ERROR_MESSAGES.INVALID_INPUT,
                    code: errorCodes.INVALID_INPUT,
                    retryable: false,
                },
            };
        }

        // 5xx -> the ML service failed internally; transient, retryable.
        return {
            status: 502,
            body: {
                error: ML_ERROR_MESSAGES.SERVICE_ERROR,
                code: errorCodes.ML_SERVICE_ERROR,
                retryable: true,
            },
        };
    }

    // Request timed out (axios aborts with ECONNABORTED).
    if (error.code === "ECONNABORTED" || /timeout/i.test(error.message || "")) {
        return {
            status: 504,
            body: {
                error: ML_ERROR_MESSAGES.TIMEOUT,
                code: errorCodes.ML_TIMEOUT,
                retryable: true,
            },
        };
    }

    // No response at all: service down / unreachable.
    return {
        status: 503,
        body: {
            error: ML_ERROR_MESSAGES.UNAVAILABLE,
            code: errorCodes.ML_SERVICE_UNAVAILABLE,
            retryable: true,
        },
    };
};

// Express middleware for handling errors
const errorHandler = (err, req, res, next) => {
    // Handle specific error types
    if (err.name === "ValidationError") {
        return res.status(400).json(
            formatError(errorCodes.VALIDATION_ERROR, err.message, err.errors)
        );
    }

    if (err.name === "CastError") {
        return res.status(400).json(
            formatError(errorCodes.INVALID_INPUT, "Invalid ID format")
        );
    }

    if (err.code === 11000) {
        return res.status(409).json(
            formatError(errorCodes.ALREADY_EXISTS, "Duplicate key error")
        );
    }

    // Default error
    const status = err.status || 500;
    const code = err.code || errorCodes.INTERNAL_SERVER_ERROR;
    const message = err.message || "Internal server error";

    res.status(status).json(formatError(code, message));
};

module.exports = {
    formatError,
    errorHandler,
    errorCodes,
    classifyMlApiError,
};