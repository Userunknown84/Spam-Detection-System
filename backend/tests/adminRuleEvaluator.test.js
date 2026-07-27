const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { evaluateAdminRules, setCache } = require('../utils/adminRuleEvaluator');

describe('Admin Rule Evaluator', () => {
  beforeEach(() => {
    // Mock the rules cache for deterministic testing
    setCache([
      {
        _id: '1',
        pattern: 'urgent wire transfer',
        type: 'keyword',
        action: 'spam',
        enabled: true,
        priority: 10,
        description: 'Common phishing phrase'
      },
      {
        _id: '2',
        pattern: 'trusted-bank.com',
        type: 'domain',
        action: 'safe',
        enabled: true,
        priority: 5,
        description: 'Whitelist known bank domain'
      },
      {
        _id: '3',
        pattern: '^suspicious.*',
        type: 'regex',
        action: 'malicious',
        enabled: true,
        priority: 2,
        description: 'Starts with suspicious'
      },
      {
        _id: '4',
        pattern: 'admin@company.com',
        type: 'email',
        action: 'safe',
        enabled: true,
        priority: 15, // Highest priority
        description: 'Internal admin email'
      },
      {
        _id: '5',
        pattern: 'http://evil.com/login',
        type: 'url',
        action: 'spam',
        enabled: true,
        priority: 8,
        description: 'Known phishing url'
      }
    ]);
  });

  afterEach(() => {
    setCache([]); // Clear cache
  });

  it('should match a keyword rule', () => {
    const text = 'Please complete this URGENT wire transfer today.';
    const result = evaluateAdminRules(text);
    
    assert.notStrictEqual(result, null);
    assert.strictEqual(result.matched, true);
    assert.strictEqual(result.action, 'spam');
    assert.strictEqual(result.ruleId, '1');
    assert.strictEqual(result.source, 'admin_rule');
  });

  it('should match an email rule', () => {
    const text = 'Message from admin@company.com regarding your account.';
    const result = evaluateAdminRules(text);
    
    assert.notStrictEqual(result, null);
    assert.strictEqual(result.matched, true);
    assert.strictEqual(result.action, 'safe');
    assert.strictEqual(result.ruleId, '4');
  });

  it('should match a domain rule within a URL', () => {
    const text = 'Visit our secure portal at https://login.trusted-bank.com/secure';
    const result = evaluateAdminRules(text);
    
    assert.notStrictEqual(result, null);
    assert.strictEqual(result.matched, true);
    assert.strictEqual(result.action, 'safe');
    assert.strictEqual(result.ruleId, '2');
  });

  it('should match a domain rule within an email address', () => {
    const text = 'Contact support@trusted-bank.com';
    const result = evaluateAdminRules(text);
    
    assert.notStrictEqual(result, null);
    assert.strictEqual(result.matched, true);
    assert.strictEqual(result.action, 'safe');
    assert.strictEqual(result.ruleId, '2');
  });

  it('should match a regex rule', () => {
    const text = 'suspicious_activity_detected';
    const result = evaluateAdminRules(text);
    
    assert.notStrictEqual(result, null);
    assert.strictEqual(result.matched, true);
    assert.strictEqual(result.action, 'malicious');
    assert.strictEqual(result.ruleId, '3');
  });

  it('should match a full URL rule', () => {
    const text = 'Check out this link: http://evil.com/login';
    const result = evaluateAdminRules(text);
    
    assert.notStrictEqual(result, null);
    assert.strictEqual(result.matched, true);
    assert.strictEqual(result.action, 'spam');
    assert.strictEqual(result.ruleId, '5');
  });

  it('should return null when no rules match', () => {
    const text = 'Hello, this is a normal message with no spammy content.';
    const result = evaluateAdminRules(text);
    assert.strictEqual(result, null);
  });

  it('should respect priority order (first matching rule wins)', () => {
    const text = 'From admin@company.com: URGENT wire transfer needed.';
    const mockCache = [
      { _id: '4', pattern: 'admin@company.com', type: 'email', action: 'safe', priority: 15 },
      { _id: '1', pattern: 'urgent wire transfer', type: 'keyword', action: 'spam', priority: 10 }
    ];
    setCache(mockCache);
    
    const sortedResult = evaluateAdminRules(text);
    assert.strictEqual(sortedResult.action, 'safe');
    assert.strictEqual(sortedResult.ruleId, '4');
  });
});
