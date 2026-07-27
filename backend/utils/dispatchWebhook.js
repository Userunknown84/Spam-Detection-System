// src/utils/dispatchWebhook.js
const net = require('net');
const User = require('../models/User');
const WebhookDelivery = require('../models/WebhookDelivery');

const { isSafeWebhookUrl } = require('./urlValidator');

/**
 * Enqueues a high-risk threat alert for reliable webhook delivery.
 * @param {string} userId - The ID of the user to send the webhook for.
 * @param {Object} payload - The threat details payload.
 */
const dispatchWebhook = async (userId, payload) => {
  try {
    const user = await User.findById(userId);
    if (user && user.webhookUrl) {
      if (!(await isSafeWebhookUrl(user.webhookUrl))) {
        console.warn(`[Webhook Blocked] SSRF protection prevented queueing request to: ${user.webhookUrl}`);
        return;
      }

      console.log(`[Webhook] Enqueueing threat alert to: ${user.webhookUrl}`);

      // Insert into retry queue (processed by webhookRetryCron)
      await WebhookDelivery.create({
        userId: user._id,
        url: user.webhookUrl,
        payload: {
          event: 'high_risk_threat_detected',
          timestamp: new Date().toISOString(),
          threat_details: payload
        }
      });
    }
  } catch (err) {
    console.error('[Webhook Error] Error enqueuing webhook:', err.message);
  }
};

module.exports = dispatchWebhook;