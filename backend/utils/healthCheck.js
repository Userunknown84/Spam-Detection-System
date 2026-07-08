const mongoose = require("mongoose");
const axios = require("axios");
const { appVersion } = require("../config/appMetadata");

/**
 * Check MongoDB connection status
 */
const checkMongoDB = () => {
    const state = mongoose.connection.readyState;
    const states = {
        0: "disconnected",
        1: "connected",
        2: "connecting",
        3: "disconnecting",
    };

    return {
        status: states[state] || "unknown",
        state,
        ready: state === 1,
    };
};

/**
 * Check Flask API status
 */
const checkFlaskAPI = async () => {
    try {
        let apiUrl = process.env.API || "http://localhost:5000/predict";

        // Ensure we hit the base URL for health check, stripping trailing slashes
        apiUrl = apiUrl.replace(/\/predict\/?$/, "").replace(/\/+$/, "");

        const response = await axios.get(`${apiUrl}/health`, {
            timeout: 2000,
        });

        return {
            status: response.status === 200 ? "healthy" : "unhealthy",
            ready: response.status === 200,
            url: apiUrl,
        };
    } catch (error) {
        let apiUrl = process.env.API || "http://localhost:5000/predict";

        return {
            status: "error",
            ready: false,
            url: apiUrl.replace(/\/predict\/?$/, "").replace(/\/+$/, ""),
            error: error.message,
        };
    }
};

/**
 * Get comprehensive health status
 */
const getHealthStatus = async () => {
    const mongodb = checkMongoDB();
    const flask = await checkFlaskAPI();

    const allReady = mongodb.ready && flask.ready;

    return {
        status: allReady ? "healthy" : "unhealthy",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: appVersion,
        dependencies: {
            mongodb,
            flask,
        },
    };
};

module.exports = { getHealthStatus };