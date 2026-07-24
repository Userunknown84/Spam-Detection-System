/**
 * Adversarial Guard - Runtime pattern detection & confidence monitoring
<<<<<<< Updated upstream

=======
<<<<<<< HEAD
=======
 * Detects potential adversarial attacks in real-time
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
 */

const CONFIDENCE_THRESHOLD = parseFloat(process.env.CONFIDENCE_THRESHOLD) || 0.6;
const FLAG_LOW_CONFIDENCE = process.env.FLAG_LOW_CONFIDENCE === 'true';

// Common adversarial patterns
const ADVERSARIAL_PATTERNS = {
    characterSubstitution: {
        regex: /[@4áâ][3éè][1!í][0óö][$5z]/gi,
        weight: 0.3
    },
    excessiveNoise: {
        regex: /[!?.,]{3,}/g,
        weight: 0.2
    },
    unusualCapitalization: {
        regex: /[A-Z]{3,}/g,
        weight: 0.2
    },
    repeatedPunctuation: {
        regex: /([!?.,])\1{2,}/g,
        weight: 0.2
    },
    suspiciousWords: {
        regex: /\b(free|claim|prize|winner|urgent|click|bonus|cash)\b/gi,
        weight: 0.3
    },
    urlPattern: {
        regex: /https?:\/\/[^\s]+|bit\.ly|tinyurl|shorturl/gi,
        weight: 0.3
    },
    leetspeak: {
        regex: /[4@]|[3€]|[1!]|[0]|[5$]|[7+]|\\|\\|/gi,
        weight: 0.4
    }
};

<<<<<<< Updated upstream

/**
 * Detect adversarial patterns in text
 */

=======
<<<<<<< HEAD
=======
/**
 * Detect adversarial patterns in text
 */
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
function detectAdversarialPatterns(text) {
    if (!text) return { isSuspicious: false, score: 0, patterns: [] };

    let score = 0;
    const matched = [];
    const details = {};

    for (const [name, pattern] of Object.entries(ADVERSARIAL_PATTERNS)) {
        const matches = text.match(pattern.regex);
        if (matches) {
            const count = matches.length;
            const patternScore = Math.min(pattern.weight * count, 1.0);
            score += patternScore;
            matched.push(name);
            details[name] = { count, score: patternScore };
        }
    }

<<<<<<< HEAD
    const normalizedScore = Math.min(score, 1.0);
    
<<<<<<< Updated upstream

=======
=======
>>>>>>> Stashed changes
    // Normalize score
    const normalizedScore = Math.min(score, 1.0);
    
    // Check for extremely long text (potential DoS)
<<<<<<< Updated upstream

=======
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
    if (text.length > 10000) {
        return {
            isSuspicious: true,
            score: Math.max(normalizedScore, 0.8),
            patterns: [...matched, 'excessive_length'],
            details: { ...details, excessive_length: text.length }
        };
    }

    return {
        isSuspicious: normalizedScore > 0.5,
        score: normalizedScore,
        patterns: matched,
        details
    };
}

<<<<<<< HEAD
function adversarialGuard(req, res, next) {
    const text = req.body?.text || req.query?.text || '';
    
<<<<<<< Updated upstream
=======
=======
>>>>>>> Stashed changes
/**
 * Middleware to check for adversarial patterns
 */
function adversarialGuard(req, res, next) {
    const text = req.body?.text || req.query?.text || '';
    
    // Skip if no text
<<<<<<< Updated upstream

=======
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
    if (!text) {
        req.adversarialAnalysis = { isSuspicious: false, score: 0, patterns: [] };
        return next();
    }

<<<<<<< HEAD
    const analysis = detectAdversarialPatterns(text);
    req.adversarialAnalysis = analysis;

<<<<<<< Updated upstream

=======
=======
>>>>>>> Stashed changes
    // Check for adversarial patterns
    const analysis = detectAdversarialPatterns(text);
    req.adversarialAnalysis = analysis;

    // Log suspicious activity
<<<<<<< Updated upstream

=======
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
    if (analysis.isSuspicious) {
        console.log(`⚠️ [ADVERSARIAL GUARD] Suspicious pattern detected:`, {
            score: analysis.score,
            patterns: analysis.patterns,
            textPreview: text.substring(0, 100),
            ip: req.ip,
            user: req.user?.id || 'anonymous'
        });
    }

    next();
}

<<<<<<< Updated upstream

/**
 * Middleware to monitor prediction confidence
 */

=======
<<<<<<< HEAD
=======
/**
 * Middleware to monitor prediction confidence
 */
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
function monitorConfidence(req, res, next) {
    const originalSend = res.send;
    
    res.send = function(data) {
        try {
<<<<<<< Updated upstream

            // Parse the response

=======
<<<<<<< HEAD
=======
            // Parse the response
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
            let responseData;
            if (typeof data === 'string') {
                responseData = JSON.parse(data);
            } else {
                responseData = data;
            }

<<<<<<< HEAD
            if (responseData && typeof responseData === 'object') {
                const confidence = responseData.confidence_score || responseData.confidence || 0;
                
<<<<<<< Updated upstream

=======
=======
>>>>>>> Stashed changes
            // Check if it's a prediction response
            if (responseData && typeof responseData === 'object') {
                const confidence = responseData.confidence_score || responseData.confidence || 0;
                
                // Add adversarial analysis
<<<<<<< Updated upstream

=======
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
                if (req.adversarialAnalysis) {
                    responseData.adversarial_analysis = {
                        is_suspicious: req.adversarialAnalysis.isSuspicious,
                        score: req.adversarialAnalysis.score,
                        patterns: req.adversarialAnalysis.patterns
                    };
                }

<<<<<<< Updated upstream

                // Flag low confidence

=======
<<<<<<< HEAD
=======
                // Flag low confidence
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
                if (FLAG_LOW_CONFIDENCE && confidence < CONFIDENCE_THRESHOLD) {
                    responseData.low_confidence = true;
                    responseData.needs_review = true;
                    
                    console.log(`⚠️ [CONFIDENCE MONITOR] Low confidence prediction:`, {
                        confidence,
                        threshold: CONFIDENCE_THRESHOLD,
<<<<<<< HEAD
                        prediction: responseData.result || responseData.prediction
                    });
                }

<<<<<<< Updated upstream

=======
=======
>>>>>>> Stashed changes
                        prediction: responseData.result || responseData.prediction,
                        textPreview: req.body?.text?.substring(0, 100)
                    });
                }

                // If suspicious AND low confidence, flag for immediate review
<<<<<<< Updated upstream
=======
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
                if (req.adversarialAnalysis?.isSuspicious && confidence < CONFIDENCE_THRESHOLD) {
                    responseData.requires_immediate_review = true;
                    responseData.review_reason = 'Adversarial pattern detected with low confidence';
                }

<<<<<<< Updated upstream
                // Return modified response

=======
<<<<<<< HEAD
=======
                // Return modified response
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
                const jsonData = JSON.stringify(responseData);
                originalSend.call(this, jsonData);
                return;
            }
<<<<<<< HEAD
        } catch (e) {}
<<<<<<< Updated upstream
        } catch (e) {
            // If parsing fails, just pass through
        }
=======
=======
        } catch (e) {
            // If parsing fails, just pass through
        }
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
        
        originalSend.call(this, data);
    };
    
    next();
}

module.exports = {
    adversarialGuard,
    monitorConfidence,
    detectAdversarialPatterns,
    CONFIDENCE_THRESHOLD
};