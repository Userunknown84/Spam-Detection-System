const { Queue } = require('bullmq');
const Redis = require('ioredis');

// Using the same Redis connection config strategy as in cacheMiddleware
const connection = new Redis(process.env.REDIS_URI || 'redis://localhost:6379', {
    maxRetriesPerRequest: null, // Required by BullMQ
});

const predictionQueue = new Queue('PredictionQueue', { connection });

module.exports = {
  predictionQueue,
  connection
};
