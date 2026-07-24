const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { checkPermission } = require('../middleware/zeroTrust');
const { spawn } = require('child_process');
const path = require('path');

const MULTIMODAL_SCRIPT = path.join(__dirname, '../multimodal_detector.py');

/**
 * @route   POST /api/multimodal/detect
 * @desc    Detect spam using multimodal ensemble
 * @access  Private
 */
router.post('/detect', protect, async (req, res) => {
    try {
        const { text, image, voice } = req.body;
        
        if (!text && !image && !voice) {
            return res.status(400).json({
                success: false,
                error: 'At least one modality (text, image, or voice) is required'
            });
        }
        
        const result = await runMultimodal('detect', { text, image, voice });
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route   POST /api/multimodal/detect/text
 * @desc    Detect spam in text only
 * @access  Private
 */
router.post('/detect/text', protect, async (req, res) => {
    try {
        const { text } = req.body;
        if (!text) {
            return res.status(400).json({ success: false, error: 'Text is required' });
        }
        
        const result = await runMultimodal('detect_text', { text });
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route   POST /api/multimodal/detect/image
 * @desc    Detect spam in image
 * @access  Private
 */
router.post('/detect/image', protect, async (req, res) => {
    try {
        const { image } = req.body;
        if (!image) {
            return res.status(400).json({ success: false, error: 'Image data is required' });
        }
        
        const result = await runMultimodal('detect_image', { image });
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route   POST /api/multimodal/detect/voice
 * @desc    Detect spam in voice
 * @access  Private
 */
router.post('/detect/voice', protect, async (req, res) => {
    try {
        const { voice } = req.body;
        if (!voice) {
            return res.status(400).json({ success: false, error: 'Voice data is required' });
        }
        
        const result = await runMultimodal('detect_voice', { voice });
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route   POST /api/multimodal/optimize
 * @desc    Optimize NEAT weights (Admin only)
 * @access  Private (Admin)
 */
router.post('/optimize', protect, checkPermission('system_config'), async (req, res) => {
    try {
        const { predictions, groundTruth } = req.body;
        
        if (!predictions || !groundTruth) {
            return res.status(400).json({
                success: false,
                error: 'Predictions and ground truth required'
            });
        }
        
        const result = await runMultimodal('optimize', { predictions, groundTruth });
        res.json({
            success: true,
            message: 'Weights optimized successfully',
            ...result
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route   GET /api/multimodal/stats
 * @desc    Get multimodal detector statistics
 * @access  Private (Admin)
 */
router.get('/stats', protect, checkPermission('view_logs'), async (req, res) => {
    try {
        const stats = await runMultimodal('stats', {});
        res.json({ success: true, stats });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

function runMultimodal(command, params = {}) {
    return new Promise((resolve, reject) => {
        const python = spawn('python', [
            MULTIMODAL_SCRIPT,
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