const express = require('express');
const router = express.Router();
const multer = require('multer');
const { protect } = require('../middleware/authMiddleware');
const JobModel = require('../models/Job');
const { predictionQueue } = require('../jobs/predictionQueue');
const validationMessages = require('../utils/validationMessages');

// Set multer to write to uploads/ directly for BullMQ workers to read later
const upload = multer({ dest: 'uploads/' });

router.post('/bulk-predict', protect, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "Validation failed",
                error: validationMessages?.fileRequired || "No file uploaded"
            });
        }
        
        // Check file size (2MB limit)
        if (req.file.size > 2 * 1024 * 1024) {
            return res.status(413).json({
                success: false,
                message: "Payload too large",
                error: validationMessages?.fileSizeExceeded || "File size exceeds limit of 2MB"
            });
        }
        
        // Enqueue job with BullMQ
        const job = await predictionQueue.add('bulk-predict', {
            type: 'bulk-predict',
            filePath: req.file.path,
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
        });

        // Initialize Mongo Job using the BullMQ job id
        await JobModel.create({
            _id: job.id,
            type: 'bulk-predict',
            status: 'pending',
            progress: 0,
            user: req.user.id
        });

        res.status(202).json({
            jobId: job.id,
            status: 'pending',
            pollingUrl: `/api/v1/jobs/${job.id}`
        });

    } catch (error) {
        console.error("Job Creation Error:", error);
        res.status(500).json({ error: "Something went wrong enqueueing the job." });
    }
});

router.get('/:jobId', protect, async (req, res) => {
    try {
        const { jobId } = req.params;
        const job = await JobModel.findById(jobId);
        
        if (!job) {
            return res.status(404).json({ error: "Job not found" });
        }
        
        if (job.user.toString() !== req.user.id.toString()) {
            return res.status(403).json({ error: "Access denied" });
        }
        
        res.json({
            jobId: job._id,
            type: job.type,
            status: job.status,
            progress: job.progress,
            result: job.result,
            error: job.error,
            createdAt: job.createdAt,
            updatedAt: job.updatedAt
        });
    } catch (error) {
        console.error("Job Fetch Error:", error);
        res.status(500).json({ error: "Something went wrong fetching the job." });
    }
});

module.exports = router;
