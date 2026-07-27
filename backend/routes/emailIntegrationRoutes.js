// backend/routes/emailIntegrationRoutes.js
const express = require('express');
const router = express.Router();
const attachmentScanner = require('../services/attachmentScanner');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const { protect } = require('../middleware/authMiddleware');
const headerAnalyzer = require('../services/headerAnalyzer');
const emailAuthValidator = require('../services/emailAuthValidator');


const {
  gmailAuthUrl,
  gmailCallback,
  gmailConnect,
  gmailEmails,
  outlookAuthUrl,
  outlookCallback,
  outlookConnect,
  outlookEmails,
  scanEmails
} = require('../controllers/emailController');

router.post('/validate-email-auth', protect, async (req, res) => {
  try {
    const { domain } = req.body;
    
    if (!domain) {
      return res.status(400).json({ error: 'Domain is required' });
    }
    
    const result = await emailAuthValidator.validateDomain(domain);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to validate email authentication' });
  }
});

router.post('/analyze-headers', protect, async (req, res) => {
  try {
    const { headers } = req.body;
    
    if (!headers) {
      return res.status(400).json({ error: 'Headers required' });
    }

    const parsedHeaders = headerAnalyzer.parseHeaders(headers);
    const result = headerAnalyzer.analyzeHeaders(parsedHeaders);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to analyze headers' });
  }
});

router.post('/scan-attachment', protect, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const result = attachmentScanner.scanAttachment(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to scan attachment' });
  }
});

// ==================== GMAIL ROUTES ====================
router.get("/gmail/auth-url", protect, gmailAuthUrl);
router.get("/gmail/callback", gmailCallback);
router.get("/gmail/connect", protect, gmailConnect);
router.get("/gmail/emails", protect, gmailEmails);

// ==================== OUTLOOK ROUTES ====================
router.get("/outlook/auth-url", protect, outlookAuthUrl);
router.get("/outlook/callback", outlookCallback);
router.get("/outlook/connect", protect, outlookConnect);
router.get("/outlook/emails", protect, outlookEmails);

// ==================== SCAN EMAILS ROUTE ====================
router.post("/scan-emails", protect, scanEmails);

module.exports = router;