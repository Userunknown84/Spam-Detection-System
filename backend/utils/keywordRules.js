// Keyword/phrase rule support (issue #449). These helpers are pure (no DB) so
// they can be unit-tested and reused by the prediction path in server.js.

// Upper bound on a keyword pattern's length, to prevent oversized patterns
// from being stored or used for matching.
const KEYWORD_MAX_LENGTH = 200;

// Validate and normalize a keyword rule pattern. Keyword rules match message
// content, so (unlike sender rules) any non-empty string within the length
// limit is acceptable.
// Returns { valid: true, value } or { valid: false, error }.
function validateKeywordPattern(pattern) {
  if (typeof pattern !== "string") {
    return { valid: false, error: "Pattern must be a string" };
  }
  const trimmed = pattern.trim().toLowerCase();
  if (!trimmed) {
    return { valid: false, error: "Pattern cannot be empty" };
  }
  if (trimmed.length > KEYWORD_MAX_LENGTH) {
    return {
      valid: false,
      error: `Keyword pattern must be at most ${KEYWORD_MAX_LENGTH} characters`,
    };
  }
  return { valid: true, value: trimmed };
}

// Find the keyword rule that applies to a message. Matching is a
// case-insensitive substring test. A whitelist match always wins over a
// blacklist match, so a trusted phrase can override a spam-looking message.
// rules: [{ type: 'blacklist' | 'whitelist', pattern: string }]
// Returns the matched rule ({ type, pattern }) or null.
function matchKeywordRule(text, rules) {
  if (typeof text !== "string" || !text || !Array.isArray(rules)) {
    return null;
  }
  const haystack = text.toLowerCase();
  let blacklistMatch = null;
  for (const rule of rules) {
    if (!rule || typeof rule.pattern !== "string" || !rule.pattern) continue;
    if (haystack.includes(rule.pattern.toLowerCase())) {
      if (rule.type === "whitelist") {
        return { type: "whitelist", pattern: rule.pattern };
      }
      if (rule.type === "blacklist" && !blacklistMatch) {
        blacklistMatch = { type: "blacklist", pattern: rule.pattern };
      }
    }
  }
  return blacklistMatch;
}

module.exports = {
  KEYWORD_MAX_LENGTH,
  validateKeywordPattern,
  matchKeywordRule,
};
