const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { checkPermission } = require('../middleware/zeroTrust');
const { spawn } = require('child_process');
const path = require('path');

const SALTING_SCRIPT = path.join(__dirname, '../text_salting_detector.js');

router.post('/detect', protect, async (req, res) => {
    try {
        const { html } = req.body;
        if (!html) {
            return res.status(400).json({ success: false, error: 'HTML content is required' });
        }
        
        const result = await runSaltingDetector('detect', { html });
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/status', protect, checkPermission('view_logs'), async (req, res) => {
    try {
        const status = await runSaltingDetector('status', {});
        res.json({ success: true, status });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

function runSaltingDetector(command, params = {}) {
    return new Promise((resolve, reject) => {
        const python = spawn('python', [
            SALTING_SCRIPT,
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