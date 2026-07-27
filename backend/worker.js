require("dotenv").config();
const { Worker } = require('bullmq');
const Redis = require('ioredis');
const mongoose = require('mongoose');
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const config = require('./config');
const JobModel = require('./models/Job');
const logger = require('./utils/logger');

const connection = new Redis(process.env.REDIS_URI || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
});

// Connect to MongoDB
mongoose.connect(config.mongodbUri).then(() => {
    logger.info('✅ Worker connected to MongoDB');
}).catch(err => {
    logger.error('❌ Worker MongoDB connection error:', err);
    process.exit(1);
});

const ML_API_BASE = (process.env.API || "http://localhost:5000/predict").replace(/\/predict$/, "");

const worker = new Worker('PredictionQueue', async job => {
    logger.info(`Starting job ${job.id} of type ${job.data.type}`);
    const dbJob = await JobModel.findById(job.id);
    if (dbJob) {
        dbJob.status = 'processing';
        await dbJob.save();
    }
    
    await job.updateProgress(10);
    
    const filePath = job.data.filePath;
    const originalname = job.data.originalname;
    const mimetype = job.data.mimetype;
    
    try {
        const form = new FormData();
        form.append("file", fs.createReadStream(filePath), {
            filename: originalname,
            contentType: mimetype,
        });

        await job.updateProgress(20);

        const response = await axios.post(`${ML_API_BASE}/bulk-predict`, form, {
            headers: {
                ...form.getHeaders(),
            },
            timeout: 0, // No timeout for long running bulk jobs
        });

        await job.updateProgress(90);

        if (dbJob) {
            dbJob.status = 'completed';
            dbJob.result = response.data;
            dbJob.progress = 100;
            await dbJob.save();
        }
        await job.updateProgress(100);
        
        return response.data;
    } catch (error) {
        let errorMsg = error.message;
        if (error.response && error.response.data) {
            errorMsg = JSON.stringify(error.response.data);
        }
        logger.error(`Job ${job.id} failed: ${errorMsg}`);
        if (dbJob) {
            dbJob.status = 'failed';
            dbJob.error = errorMsg;
            await dbJob.save();
        }
        throw new Error(errorMsg);
    } finally {
        // Cleanup temporary file
        if (filePath && fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
                logger.info(`Deleted temporary file ${filePath}`);
            } catch (err) {
                logger.error(`Failed to delete temporary file ${filePath}: ${err.message}`);
            }
        }
    }
}, { connection });

worker.on('completed', job => {
    logger.info(`Job ${job.id} has completed!`);
});

worker.on('failed', (job, err) => {
    logger.error(`Job ${job.id} has failed with ${err.message}`);
});

process.on('SIGINT', async () => {
    await worker.close();
    process.exit(0);
});
process.on('SIGTERM', async () => {
    await worker.close();
    process.exit(0);
});
