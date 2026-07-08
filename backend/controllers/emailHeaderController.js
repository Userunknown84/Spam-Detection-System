const EmailHeaderAnalyzer = require('../services/emailHeaderAnalyzer');

class EmailHeaderController {
    static async verifyHeaders(req, res) {
        try {
            const { email_content } = req.body;

            if (!email_content || typeof email_content !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: 'Email content is required and must be a string'
                });
            }

            const result = await EmailHeaderAnalyzer.analyze(email_content);

            return res.status(200).json({
                success: true,
                data: result
            });

        } catch (error) {
            console.error('Email header analysis error:', error);

            return res.status(500).json({
                success: false,
                error: 'Failed to analyze email headers',
                details: 'Internal server error'
            });
        }
    }
}

module.exports = EmailHeaderController;