const AdminRule = require('../models/AdminRule');

let rulesCache = [];

/**
 * Refreshes the in-memory cache of enabled AdminRules.
 * Call this function on application startup and whenever an AdminRule is created, updated, or deleted.
 */
const refreshAdminRulesCache = async () => {
  try {
    rulesCache = await AdminRule.find({ enabled: true })
      .sort({ priority: -1, createdAt: -1 })
      .lean();
    console.log(`AdminRule cache refreshed. Loaded ${rulesCache.length} rules.`);
  } catch (error) {
    console.error('Failed to refresh AdminRule cache:', error);
  }
};

/**
 * Evaluates the given text against the cached admin rules.
 * @param {string} text - The input text to evaluate.
 * @returns {Object|null} - The match result `{ matched: true, action, ruleId, source: 'admin_rule', description }` or null.
 */
const evaluateAdminRules = (text) => {
  if (!text || typeof text !== 'string') return null;

  // Extract URLs and emails for specialized matching
  const urlMatches = text.match(/(https?:\/\/[^\s]+)/g) || [];
  const emailMatches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
  
  // Extract pure domains from URLs and Emails
  const domainMatches = new Set();
  urlMatches.forEach(url => {
    try {
      const parsedUrl = new URL(url);
      domainMatches.add(parsedUrl.hostname.toLowerCase());
    } catch (e) {
      // Ignore invalid URLs
    }
  });
  emailMatches.forEach(email => {
    const parts = email.split('@');
    if (parts.length === 2) {
      domainMatches.add(parts[1].toLowerCase());
    }
  });

  const domains = Array.from(domainMatches);
  const textLower = text.toLowerCase();

  for (const rule of rulesCache) {
    try {
      let isMatch = false;
      const patternLower = rule.pattern.toLowerCase();

      switch (rule.type) {
        case 'regex':
          const regex = new RegExp(rule.pattern, 'i');
          isMatch = regex.test(text);
          break;
        case 'keyword':
          isMatch = textLower.includes(patternLower);
          break;
        case 'url':
          isMatch = urlMatches.some(url => url.toLowerCase().includes(patternLower));
          break;
        case 'email':
          isMatch = emailMatches.some(email => email.toLowerCase() === patternLower);
          break;
        case 'domain':
          // Domain rule matches if any extracted domain exactly matches or ends with the pattern (e.g. subdomains)
          isMatch = domains.some(domain => domain === patternLower || domain.endsWith(`.${patternLower}`));
          break;
        default:
          break;
      }

      if (isMatch) {
        return {
          matched: true,
          action: rule.action,
          ruleId: rule._id.toString(),
          source: 'admin_rule',
          description: rule.description
        };
      }
    } catch (error) {
      console.error(`Error evaluating admin rule ${rule._id}:`, error);
      // Skip this rule and continue with others
    }
  }

  return null;
};

module.exports = {
  refreshAdminRulesCache,
  evaluateAdminRules,
  // Exposed for testing
  getCache: () => rulesCache,
  setCache: (mockCache) => { rulesCache = mockCache; }
};
