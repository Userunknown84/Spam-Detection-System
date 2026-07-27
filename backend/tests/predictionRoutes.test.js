// Covers issue #820's Node/Express requirement: Jest/Supertest tests for the
// /predict proxy route (routes/predictionRoutes.js) exercising the success
// path, upstream ML API timeouts, and upstream/connection errors. Auth, rate
// limiting, caching, and Mongoose models are mocked so the route can be
// exercised over real HTTP without a live DB, Redis, or Flask process.

const express = require('express');
const request = require('supertest');
const axios = require('axios');

jest.mock('axios');
jest.mock('../middleware/authMiddleware', () => ({
  protect: (req, res, next) => {
    req.user = { id: 'test-user-1' };
    next();
  },
}));
jest.mock('../middleware/rateLimiter', () => ({
  predictLimiter: (req, res, next) => next(),
}));
jest.mock('../middleware/cacheMiddleware', () => ({
  checkCache: (req, res, next) => next(),
  setCache: jest.fn().mockResolvedValue(undefined),
  redisClient: { status: 'end', get: jest.fn(), set: jest.fn() },
  preventCacheStampede: (req, res, next) => next(),
}));
jest.mock('../models/History', () => ({ create: jest.fn().mockResolvedValue({}) }));
jest.mock('../models/Rule', () => ({
  findOne: jest.fn().mockResolvedValue(null),
  find: jest.fn(() => ({ limit: () => ({ lean: () => Promise.resolve([]) }) })),
}));
jest.mock('../models/User', () => ({}));
jest.mock('../utils/dispatchWebhook', () => jest.fn());

// server.js normally sets this up at boot (see server.js's Sentry setup); the
// route file references the bare `Sentry` global directly in its catch blocks.
global.Sentry = { captureException: jest.fn() };

const predictionRoutes = require('../routes/predictionRoutes');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/', predictionRoutes);
  return app;
}

describe('POST /predict proxy route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('forwards a valid request to the ML API and returns its response', async () => {
    axios.post.mockResolvedValueOnce({
      data: {
        input: 'Win a free prize now!',
        prediction: 'spam',
        result: 'spam',
        confidence: 0.97,
      },
    });

    const res = await request(buildApp())
      .post('/predict')
      .send({ text: 'Win a free prize now!', type: 'message' });

    expect(res.status).toBe(200);
    expect(res.body.prediction).toBe('spam');
    expect(axios.post).toHaveBeenCalledTimes(1);
    const [url, body] = axios.post.mock.calls[0];
    expect(url).toMatch(/\/predict$/);
    expect(body).toMatchObject({ text: 'Win a free prize now!', type: 'message' });
  });

  it('returns 400 without calling the ML API when text is missing', async () => {
    const res = await request(buildApp()).post('/predict').send({ type: 'message' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('returns 200 with fallback data when the ML API call times out', async () => {
    const timeoutError = new Error('timeout of 15000ms exceeded');
    timeoutError.code = 'ECONNABORTED';
    axios.post.mockRejectedValueOnce(timeoutError);

    const res = await request(buildApp())
      .post('/predict')
      .send({ text: 'Hello there', type: 'message' });

    expect(res.status).toBe(200);
    expect(res.body.fallback).toBe(true);
    expect(res.body.prediction).toBeDefined();
  });

  it('returns 200 with fallback data when the ML API is unreachable', async () => {
    const connError = new Error('connect ECONNREFUSED 127.0.0.1:5000');
    connError.code = 'ECONNREFUSED';
    axios.post.mockRejectedValueOnce(connError);

    const res = await request(buildApp())
      .post('/predict')
      .send({ text: 'Hello there', type: 'message' });

    expect(res.status).toBe(200);
    expect(res.body.fallback).toBe(true);
  });

  it('forwards the ML API upstream 4xx response as a non-retryable error', async () => {
    const upstreamError = new Error('Request failed with status code 400');
    upstreamError.response = { status: 400, data: { error: "'text' exceeds maximum length" } };
    axios.post.mockRejectedValueOnce(upstreamError);

    const res = await request(buildApp())
      .post('/predict')
      .send({ text: 'Hello there', type: 'message' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("'text' exceeds maximum length");
    expect(res.body.retryable).toBe(false);
  });

  it('returns 200 with fallback data when ML API returns 500', async () => {
    const upstreamError = new Error('Request failed with status code 500');
    upstreamError.response = { status: 500, data: { error: 'internal error' } };
    axios.post.mockRejectedValueOnce(upstreamError);

    const res = await request(buildApp())
      .post('/predict')
      .send({ text: 'Hello there', type: 'message' });

    expect(res.status).toBe(200);
    expect(res.body.fallback).toBe(true);
  });
});
