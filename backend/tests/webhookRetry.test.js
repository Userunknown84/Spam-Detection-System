const axios = require('axios');
const WebhookDelivery = require('../models/WebhookDelivery');
const User = require('../models/User');
const { processWebhooks, isSafeWebhookUrl } = require('../jobs/webhookRetryCron');
const dispatchWebhook = require('../utils/dispatchWebhook');

jest.mock('axios');
jest.mock('../models/WebhookDelivery');
jest.mock('../models/User', () => ({
  findById: jest.fn(),
}));

describe('Webhook Retry Queue & Cron Job', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isSafeWebhookUrl Validation', () => {
    it('should reject unsafe URLs', async () => {
      expect(await isSafeWebhookUrl('http://localhost:8080')).toBe(false);
      expect(await isSafeWebhookUrl('http://127.0.0.1/test')).toBe(false);
      expect(await isSafeWebhookUrl('http://169.254.169.254/latest/meta-data')).toBe(false);
      expect(await isSafeWebhookUrl('ftp://test.com')).toBe(false);
    });

    it('should allow safe URLs', async () => {
      expect(await isSafeWebhookUrl('https://webhook.site/test')).toBe(true);
      expect(await isSafeWebhookUrl('http://api.github.com/')).toBe(true);
    });

    it('should reject alternate IP encodings', async () => {
      expect(await isSafeWebhookUrl('http://0x7f000001')).toBe(false);
      expect(await isSafeWebhookUrl('http://2130706433')).toBe(false);
      expect(await isSafeWebhookUrl('http://0177.0.0.1')).toBe(false);
      expect(await isSafeWebhookUrl('http://0x7f.0.0.1')).toBe(false);
      expect(await isSafeWebhookUrl('http://[::ffff:127.0.0.1]')).toBe(false);
      expect(await isSafeWebhookUrl('http://[::ffff:7f00:1]')).toBe(false);
    });
  });

  describe('dispatchWebhook', () => {
    it('should reject unsafe URL early and not enqueue', async () => {
      User.findById.mockResolvedValue({ _id: '1', webhookUrl: 'http://localhost/test' });
      await dispatchWebhook('1', { details: 'threat' });
      expect(WebhookDelivery.create).not.toHaveBeenCalled();
    });

    it('should enqueue a safe webhook into WebhookDelivery', async () => {
      User.findById.mockResolvedValue({ _id: '1', webhookUrl: 'https://webhook.site/test2' });
      await dispatchWebhook('1', { details: 'threat' });
      expect(WebhookDelivery.create).toHaveBeenCalledWith(expect.objectContaining({
        userId: '1',
        url: 'https://webhook.site/test2',
        payload: expect.any(Object)
      }));
    });
  });

  describe('webhookRetryCron', () => {
    it('should successfully deliver a pending webhook and update status to success', async () => {
      const mockJob = {
        _id: '1',
        url: 'https://webhook.site/test3',
        payload: { test: true },
        attempts: 0,
        maxAttempts: 5,
        save: jest.fn()
      };
      
      WebhookDelivery.findOneAndUpdate
        .mockResolvedValueOnce(mockJob)
        .mockResolvedValueOnce(null); // exit loop

      axios.post.mockResolvedValueOnce({ status: 200 });

      await processWebhooks();

      expect(mockJob.status).toBe('success');
      expect(mockJob.attempts).toBe(1);
      expect(mockJob.lockedAt).toBeNull();
      expect(mockJob.save).toHaveBeenCalled();
    });

    it('should set rejected if SSRF fails before delivery', async () => {
      const mockJob = {
        _id: '1',
        url: 'http://127.0.0.1/test4',
        payload: { test: true },
        save: jest.fn()
      };
      
      WebhookDelivery.findOneAndUpdate
        .mockResolvedValueOnce(mockJob)
        .mockResolvedValueOnce(null);

      await processWebhooks();

      expect(mockJob.status).toBe('rejected');
      expect(mockJob.lastError).toContain('SSRF validation failed');
      expect(mockJob.lockedAt).toBeNull();
      expect(mockJob.save).toHaveBeenCalled();
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('should follow 1, 2, 4, 8 min retry sequence and then fail at 5th attempt', async () => {
      axios.post.mockRejectedValue(new Error('Network Error'));

      let mockJob = {
        _id: '1',
        url: 'https://webhook.site/test5',
        payload: { test: true },
        attempts: 0,
        maxAttempts: 5,
        save: jest.fn()
      };

      const start = Date.now();
      jest.useFakeTimers();
      jest.setSystemTime(start);

      // Attempt 1 -> fails -> delay is 1 min (60,000ms)
      WebhookDelivery.findOneAndUpdate.mockResolvedValueOnce(mockJob).mockResolvedValueOnce(null);
      await processWebhooks();
      expect(mockJob.status).toBe('failed');
      expect(mockJob.attempts).toBe(1);
      expect(mockJob.nextRetry.getTime()).toBe(start + 60000);

      // Attempt 2 -> fails -> delay is 2 min
      jest.setSystemTime(start + 60000);
      WebhookDelivery.findOneAndUpdate.mockResolvedValueOnce(mockJob).mockResolvedValueOnce(null);
      await processWebhooks();
      expect(mockJob.attempts).toBe(2);
      expect(mockJob.nextRetry.getTime()).toBe(start + 60000 + 120000);

      // Attempt 3 -> fails -> delay is 4 min
      jest.setSystemTime(mockJob.nextRetry.getTime());
      WebhookDelivery.findOneAndUpdate.mockResolvedValueOnce(mockJob).mockResolvedValueOnce(null);
      await processWebhooks();
      expect(mockJob.attempts).toBe(3);
      // Wait, 3rd attempt nextRetry is nextRetry + 4 mins

      // Attempt 4 -> fails -> delay is 8 min
      jest.setSystemTime(mockJob.nextRetry.getTime());
      WebhookDelivery.findOneAndUpdate.mockResolvedValueOnce(mockJob).mockResolvedValueOnce(null);
      await processWebhooks();
      expect(mockJob.attempts).toBe(4);

      // Attempt 5 -> fails -> max_attempts_exceeded
      jest.setSystemTime(mockJob.nextRetry.getTime());
      WebhookDelivery.findOneAndUpdate.mockResolvedValueOnce(mockJob).mockResolvedValueOnce(null);
      await processWebhooks();
      expect(mockJob.attempts).toBe(5);
      expect(mockJob.status).toBe('max_attempts_exceeded');
      
      jest.useRealTimers();
    });

    it('should explicitly use $or for atomic claim and include stale recovery logic', async () => {
      WebhookDelivery.findOneAndUpdate.mockResolvedValueOnce(null);
      const start = Date.now();
      jest.useFakeTimers();
      jest.setSystemTime(start);

      await processWebhooks();
      
      const leaseTimeout = new Date(start - 5 * 60 * 1000);
      const now = new Date(start);

      expect(WebhookDelivery.findOneAndUpdate).toHaveBeenCalledWith(
        {
          $or: [
            { status: { $in: ['pending', 'failed'] }, nextRetry: { $lte: now } },
            { status: 'processing', lockedAt: { $lt: leaseTimeout } }
          ]
        },
        expect.any(Object),
        { new: true, sort: { nextRetry: 1 } }
      );
      jest.useRealTimers();
    });

    it('should explicitly enforce a 10000ms timeout on axios request', async () => {
      const mockJob = {
        _id: '1',
        url: 'https://webhook.site/test6',
        payload: { test: true },
        attempts: 0,
        maxAttempts: 5,
        save: jest.fn()
      };
      WebhookDelivery.findOneAndUpdate.mockResolvedValueOnce(mockJob).mockResolvedValueOnce(null);
      axios.post.mockResolvedValueOnce({ status: 200 });

      await processWebhooks();

      expect(axios.post).toHaveBeenCalledWith('https://webhook.site/test6', { test: true }, { timeout: 10000 });
    });
  });
});
