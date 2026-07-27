const cron = require('node-cron');
const axios = require('axios');
const WebhookDelivery = require('../models/WebhookDelivery');
const net = require('net');

const { isSafeWebhookUrl } = require('../utils/urlValidator');

const processWebhooks = async () => {
  try {
    while (true) {
      const now = new Date();
      const leaseTimeout = new Date(now.getTime() - 5 * 60 * 1000); // 5 minutes ago

      // Atomic claim
      const job = await WebhookDelivery.findOneAndUpdate(
        {
          $or: [
            { status: { $in: ['pending', 'failed'] }, nextRetry: { $lte: now } },
            { status: 'processing', lockedAt: { $lt: leaseTimeout } }
          ]
        },
        {
          $set: {
            status: 'processing',
            lockedAt: now
          }
        },
        { new: true, sort: { nextRetry: 1 } }
      );

      // If no jobs are eligible, exit the loop
      if (!job) {
        break;
      }

      // Check SSRF immediately before delivery
      if (!(await isSafeWebhookUrl(job.url))) {
        console.warn(`[Webhook Blocked] SSRF validation failed for job ${job._id} right before delivery.`);
        job.status = 'rejected';
        job.lastError = 'SSRF validation failed immediately prior to delivery';
        job.lockedAt = null;
        await job.save();
        continue; // process next job
      }

      // Attempt to dispatch
      try {
        await axios.post(job.url, job.payload, { timeout: 10000 }); // 10s timeout
        
        // Success
        job.status = 'success';
        job.attempts += 1;
        job.lastError = null;
        job.lockedAt = null;
        await job.save();
        
      } catch (err) {
        // Failure
        job.attempts += 1;
        job.lastError = err.message;
        job.lockedAt = null;
        
        if (job.attempts >= job.maxAttempts) {
          job.status = 'max_attempts_exceeded';
        } else {
          job.status = 'failed';
          // Exponential backoff: 2^(attempts-1) minutes
          // attempts = 1 -> 1 min
          // attempts = 2 -> 2 min
          // attempts = 3 -> 4 min
          // attempts = 4 -> 8 min
          const delayMs = (2 ** (job.attempts - 1)) * 60 * 1000;
          job.nextRetry = new Date(Date.now() + delayMs);
        }
        await job.save();
      }
    }
  } catch (err) {
    console.error('[Webhook Cron] Error processing webhooks:', err.message);
  }
};

// Schedule job to run every minute
cron.schedule('* * * * *', () => {
  processWebhooks();
});

module.exports = { processWebhooks, isSafeWebhookUrl }; // Exported for testing
