const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { checkPermission } = require('../middleware/zeroTrust');
const { poisoningGuard, trainingRateLimiter, validateTrainingData } = require('../middleware/poisoningGuard');
const { spawn } = require('child_process');
const path = require('path');

const DEFENSE_SCRIPT = path.join(__dirname, '../llm_poisoning_defense.py');

/**
 * @route   POST /api/poisoning/validate
 * @desc    Validate training data for poisoning
 * @access  Private (Admin)
 */
router.post('/validate',
    protect,
    checkPermission('system_config'),
    trainingRateLimiter,
    validateTrainingData,
    async (req, res) => {
        try {
            const { texts, labels } = req.body;
            
            if (!texts || !labels || texts.length !== labels.length) {
                return res.status(400).json({
                    success: false,
                    error: 'texts and labels arrays required with same length'
                });
            }

            const result = await runPoisoningDefense('validate', { texts, labels });
            
            res.json({
                success: true,
                ...result
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

/**
 * @route   POST /api/poisoning/detect
 * @desc    Detect adversarial input in real-time
 * @access  Private
 */
router.post('/detect',
    protect,
    poisoningGuard,
    async (req, res) => {
        try {
            const { text } = req.body;
            
            if (!text) {
                return res.status(400).json({
                    success: false,
                    error: 'Text is required'
                });
            }

            // Use Python for advanced detection
            const result = await runPoisoningDefense('detect_adversarial', { text });
            
            // Add Node.js detection
            const nodeAnalysis = req.poisoningAnalysis || { isSuspicious: false, score: 0, patterns: [] };
            
            res.json({
                success: true,
                ...result,
                node_analysis: nodeAnalysis
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

/**
 * @route   POST /api/poisoning/train
 * @desc    Train poisoning detector
 * @access  Private (Admin)
 */
router.post('/train',
    protect,
    checkPermission('system_config'),
    trainingRateLimiter,
    validateTrainingData,
    async (req, res) => {
        try {
            const { texts, labels } = req.body;
            
            const result = await runPoisoningDefense('train', { texts, labels });
            
            res.json({
                success: true,
                message: 'Poisoning detector trained successfully',
                ...result
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

/**
 * @route   GET /api/poisoning/status
 * @desc    Get defense system status
 * @access  Private (Admin)
 */
router.get('/status',
    protect,
    checkPermission('view_logs'),
    async (req, res) => {
        try {
            const status = await runPoisoningDefense('status', {});
            
            res.json({
                success: true,
                status
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

/**
 * Helper: Run Python defense script
 */
function runPoisoningDefense(command, params = {}) {
    return new Promise((resolve, reject) => {
        const python = spawn('python', [
            DEFENSE_SCRIPT,
            '--command', command,
            '--params', JSON.stringify(params)
        ]);
        
        let output = '';
        let errorOutput = '';
        
        python.stdout.on('data', (data) => {
            output += data.toString();
        });
        
        python.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });
        
        python.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(errorOutput || `Process exited with code ${code}`));
            } else {
                try {
                    resolve(JSON.parse(output));
                } catch (e) {
                    resolve({ output, raw: true });
                }
            }
        });
        
        python.on('error', (err) => {
            reject(err);
        });
    });
}

module.exports = router;