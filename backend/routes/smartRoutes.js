const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { checkPermission } = require('../middleware/zeroTrust');
const { spawn } = require('child_process');
const path = require('path');

const SMART_SCRIPT = path.join(__dirname, '../smart_detector.py');

/**
 * @route   POST /api/smart/detect
 * @desc    Detect spam using SMART framework
 * @access  Private
 */
router.post('/detect', protect, async (req, res) => {
    try {
        const { text } = req.body;
        if (!text) {
            return res.status(400).json({ success: false, error: 'Text is required' });
        }
        
        const result = await runSMART('detect', { text });
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route   POST /api/smart/train
 * @desc    Train SMART framework (Admin only)
 * @access  Private (Admin)
 */
router.post('/train', protect, checkPermission('system_config'), async (req, res) => {
    try {
        const { texts, labels, epochs } = req.body;
        
        if (!texts || !labels || texts.length !== labels.length) {
            return res.status(400).json({
                success: false,
                error: 'texts and labels arrays required with same length'
            });
        }
        
        const result = await runSMART('train', { texts, labels, epochs: epochs || 10 });
        res.json({
            success: true,
            message: 'SMART training completed',
            ...result
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route   POST /api/smart/rl/train
 * @desc    Train RL agent with feedback
 * @access  Private (Admin)
 */
router.post('/rl/train', protect, checkPermission('system_config'), async (req, res) => {
    try {
        const { texts, rewards } = req.body;
        
        if (!texts || !rewards || texts.length !== rewards.length) {
            return res.status(400).json({
                success: false,
                error: 'texts and rewards arrays required with same length'
            });
        }
        
        const result = await runSMART('train_rl', { texts, rewards });
        res.json({
            success: true,
            message: 'RL agent training completed',
            ...result
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route   GET /api/smart/stats
 * @desc    Get SMART framework statistics
 * @access  Private (Admin)
 */
router.get('/stats', protect, checkPermission('view_logs'), async (req, res) => {
    try {
        const stats = await runSMART('stats', {});
        res.json({ success: true, stats });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route   POST /api/smart/weights
 * @desc    Update multi-objective weights (Admin only)
 * @access  Private (Admin)
 */
router.post('/weights', protect, checkPermission('system_config'), async (req, res) => {
    try {
        const { weights } = req.body;
        
        if (!weights || typeof weights !== 'object') {
            return res.status(400).json({
                success: false,
                error: 'weights object required'
            });
        }
        
        const result = await runSMART('set_weights', { weights });
        res.json({
            success: true,
            message: 'Weights updated successfully',
            ...result
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

function runSMART(command, params = {}) {
    return new Promise((resolve, reject) => {
        const python = spawn('python', [
            SMART_SCRIPT,
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
        
        python.on('error', (err) => reject(err));
    });
}

module.exports = router;