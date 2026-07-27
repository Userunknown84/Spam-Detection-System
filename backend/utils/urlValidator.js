const dns = require('dns').promises;
const net = require('net');

/**
 * Checks if a webhook URL is safe from SSRF attacks.
 * Resolves the IP to prevent bypassing via alternative IP formats or DNS.
 * @param {string} webhookUrl - The webhook URL to validate.
 * @returns {Promise<boolean>} - True if the URL is safe, false otherwise.
 */
const isSafeWebhookUrl = async (webhookUrl) => {
  try {
    const parsed = new URL(webhookUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;

    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost') return false;

    // Resolve the hostname to an IP address to handle all formats (e.g. integer, octal)
    let resolvedIp;
    try {
      const lookupResult = await dns.lookup(host);
      resolvedIp = lookupResult.address;
    } catch (err) {
      // If DNS resolution fails, it's not a safe or routable URL
      return false;
    }

    if (net.isIP(resolvedIp)) {
      if (resolvedIp.startsWith('127.') || resolvedIp.startsWith('10.') || resolvedIp.startsWith('192.168.') || resolvedIp.startsWith('169.254.')) return false;
      
      const parts = resolvedIp.split('.');
      if (parts.length === 4) {
        const first = parseInt(parts[0], 10);
        const second = parseInt(parts[1], 10);
        if (first === 172 && second >= 16 && second <= 31) return false;
        if (first === 0) return false;
      }
      
      if (resolvedIp === '::1' || resolvedIp.startsWith('fe80:') || resolvedIp.startsWith('fc00:') || resolvedIp.startsWith('fd00:')) return false;
      
      // Also block IPv4-mapped IPv6 like ::ffff:127.0.0.1
      if (resolvedIp.startsWith('::ffff:')) {
         const ipv4Part = resolvedIp.substring(7);
         if (ipv4Part.startsWith('127.') || ipv4Part.startsWith('10.') || ipv4Part.startsWith('192.168.') || ipv4Part.startsWith('169.254.')) return false;
         const v4parts = ipv4Part.split('.');
         if (v4parts.length === 4) {
           const first = parseInt(v4parts[0], 10);
           const second = parseInt(v4parts[1], 10);
           if (first === 172 && second >= 16 && second <= 31) return false;
           if (first === 0) return false;
         }
      }
    }
    return true;
  } catch (e) {
    return false;
  }
};

module.exports = { isSafeWebhookUrl };
