/**
 * LLM Poisoning Guard - Runtime defense against poisoning attacks
 */

const rateLimit = require('express-rate-limit');

// Configuration
const MAX_REQUEST_SIZE = parseInt(process.env.MAX_REQUEST_SIZE) || 10 * 1024 * 1024; // 10MB
const MAX_TEXT_LENGTH = parseInt(process.env.MAX_TEXT_LENGTH) || 10000;
const SUSPICIOUS_PATTERNS_THRESHOLD = parseFloat(process.env.SUSPICIOUS_PATTERNS_THRESHOLD) || 0.3;

// Suspicious patterns for real-time detection
const SUSPICIOUS_PATTERNS = {
    repeatedChars: /(.)\1{4,}/g,
    excessivePunctuation: /[!?.,]{4,}/g,
    allCaps: /[A-Z]{5,}/g,
    specialChars: /[^a-zA-Z0-9\s!?.,]/g,
    urlObfuscation: /https?:\/\/[^\s]+\?[^\s]+/g,
    homoglyph: /[^\x00-\x7F]/g,
    weirdSpacing: /\s{3,}/g
};

/**
 * Detect poisoning patterns in text
 */
function detectPoisoningPatterns(text) {
    if (!text) return { isSuspicious: false, score: 0, patterns: [] };

    let score = 0;
    const matched = [];
    const details = {};

    for (const [name, pattern] of Object.entries(SUSPICIOUS_PATTERNS)) {
        const matches = text.match(pattern);
        if (matches) {
            const count = matches.length;
            const patternScore = Math.min(count * 0.05, 0.3);
            score += patternScore;
            matched.push(name);
            details[name] = { count, score: patternScore };
        }
    }

    // Check text length ratio (poisoning often uses very long text)
    if (text.length > 1000 && text.length > MAX_TEXT_LENGTH * 0.5) {
        score += 0.2;
        matched.push('excessive_length');
    }

    // Check entropy (poisoned data often has higher entropy)
    if (text.length > 100) {
        const entropy = calculateEntropy(text);
        if (entropy > 4.5) {
            score += 0.3;
            matched.push('high_entropy');
        }
    }

    const normalizedScore = Math.min(score, 1.0);

    return {
        isSuspicious: normalizedScore > SUSPICIOUS_PATTERNS_THRESHOLD,
        score: normalizedScore,
        patterns: matched,
        details
    };
}

/**
 * Calculate Shannon entropy of text
 */
function calculateEntropy(text) {
    const freq = {};
    let total = 0;
    for (const char of text.toLowerCase()) {
        if (char.match(/[a-z]/)) {
            freq[char] = (freq[char] || 0) + 1;
            total++;
        }
    }

    let entropy = 0;
    for (const count of Object.values(freq)) {
        const p = count / total;
        entropy -= p * Math.log2(p);
    }
    return entropy;
}

/**
 * Middleware to check for poisoning attempts
 */
function poisoningGuard(req, res, next) {
    const text = req.body?.text || req.body?.html || req.query?.text || '';

    // Check text length
    if (text.length > MAX_TEXT_LENGTH) {
        return res.status(413).json({
            success: false,
            error: `Text exceeds maximum length of ${MAX_TEXT_LENGTH} characters`
        });
    }

    // Check request size
    const contentLength = parseInt(req.headers['content-length']) || 0;
    if (contentLength > MAX_REQUEST_SIZE) {
        return res.status(413).json({
            success: false,
            error: `Request exceeds maximum size of ${MAX_REQUEST_SIZE / (1024 * 1024)}MB`
        });
    }

    // Detect poisoning patterns
    const analysis = detectPoisoningPatterns(text);
    
    // Log suspicious activity
    if (analysis.isSuspicious) {
        console.log(`⚠️ [POISONING GUARD] Suspicious pattern detected:`, {
            score: analysis.score,
            patterns: analysis.patterns,
            textPreview: text.substring(0, 100),
            ip: req.ip,
            user: req.user?.id || 'anonymous'
        });

        // Store for monitoring
        req.poisoningAnalysis = analysis;
    }

    req.poisoningAnalysis = analysis;
    next();
}

/**
 * Rate limiter for training endpoints to prevent poisoning attacks
 */
const trainingRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // 5 training requests per hour
    message: {
        success: false,
        error: 'Too many training requests. Please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        return req.user?.id || req.ip || req.connection.remoteAddress;
    }
});

/**
 * Validate training data
 */
function validateTrainingData(req, res, next) {
    const { samples } = req.body;

    if (!samples || !Array.isArray(samples) || samples.length === 0) {
        return res.status(400).json({
            success: false,
            error: 'Training samples required'
        });
    }

    if (samples.length > 10000) {
        return res.status(413).json({
            success: false,
            error: 'Too many training samples (max: 10000)'
        });
    }

    // Validate each sample
    const invalidSamples = [];
    for (let i = 0; i < samples.length; i++) {
        const sample = samples[i];
        if (!sample.text || typeof sample.text !== 'string') {
            invalidSamples.push(i);
            continue;
        }
        if (sample.text.length > MAX_TEXT_LENGTH) {
            invalidSamples.push(i);
            continue;
        }
        if (!sample.label || !['ham', 'spam'].includes(sample.label)) {
            invalidSamples.push(i);
        }
    }

    if (invalidSamples.length > 0) {
        return res.status(400).json({
            success: false,
            error: `Invalid samples at indices: ${invalidSamples.slice(0, 10).join(', ')}`,
            invalidCount: invalidSamples.length
        });
    }

    next();
}

module.exports = {
    poisoningGuard,
    trainingRateLimiter,
    validateTrainingData,
    detectPoisoningPatterns,
    MAX_TEXT_LENGTH,
    MAX_REQUEST_SIZE
};