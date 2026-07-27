const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { checkPermission } = require('../middleware/zeroTrust');
const { spawn } = require('child_process');
const path = require('path');

const DEFENSE_SCRIPT = path.join(__dirname, '../multi_level_defense.py');

router.post('/detect', protect, async (req, res) => {
    try {
        const { text } = req.body;
        if (!text) {
            return res.status(400).json({ success: false, error: 'Text is required' });
        }
        
        const result = await runDefense('detect', { text });
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/train', protect, checkPermission('system_config'), async (req, res) => {
    try {
        const { samples } = req.body;
        if (!samples || !Array.isArray(samples) || samples.length === 0) {
            return res.status(400).json({ success: false, error: 'Training samples required' });
        }
        
        const result = await runDefense('train', { samples });
        res.json({ success: true, message: 'Training completed', result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/status', protect, checkPermission('view_logs'), async (req, res) => {
    try {
        const status = await runDefense('status', {});
        res.json({ success: true, status });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

function runDefense(command, params = {}) {
    return new Promise((resolve, reject) => {
        const python = spawn('python', [
            DEFENSE_SCRIPT,
            '--command', command,
            '--params', JSON.stringify(params)
        ]);
        
        let output = '';
        let errorOutput = '';
        
        python.stdout.on('data', (data) => { output += data.toString(); });
        python.stderr.on('data', (data) => { errorOutput += data.toString(); });
        
        python.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(errorOutput || `Process exited with code ${code}`));
            } else {
                try { resolve(JSON.parse(output)); } 
                catch (e) { resolve({ output, raw: true }); }
            }
        });
        
        python.on('error', (err) => reject(err));
    });
}

module.exports = router;