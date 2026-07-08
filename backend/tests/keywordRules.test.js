// Verifies keyword/phrase rule support (issue #449): pattern validation and
// content matching, including whitelist-overrides-blacklist precedence. These
// cover the pure helpers used by the prediction path, so no DB is required.

const test = require("node:test");
const assert = require("node:assert");

const {
  validateKeywordPattern,
  matchKeywordRule,
  KEYWORD_MAX_LENGTH,
} = require("../utils/keywordRules");

test("validateKeywordPattern accepts a normal phrase and normalizes it", () => {
  const result = validateKeywordPattern("  Free Money  ");
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.value, "free money");
});

test("validateKeywordPattern rejects empty / whitespace-only patterns", () => {
  for (const bad of ["", "   ", "\t\n"]) {
    const result = validateKeywordPattern(bad);
    assert.strictEqual(result.valid, false);
    assert.match(result.error, /empty/i);
  }
});

test("validateKeywordPattern rejects non-string patterns", () => {
  for (const bad of [null, undefined, 123, {}, []]) {
    const result = validateKeywordPattern(bad);
    assert.strictEqual(result.valid, false);
  }
});

test("validateKeywordPattern rejects patterns over the length limit", () => {
  const tooLong = "a".repeat(KEYWORD_MAX_LENGTH + 1);
  const result = validateKeywordPattern(tooLong);
  assert.strictEqual(result.valid, false);
  assert.match(result.error, /at most/i);

  const atLimit = "a".repeat(KEYWORD_MAX_LENGTH);
  assert.strictEqual(validateKeywordPattern(atLimit).valid, true);
});

test("matchKeywordRule flags a blacklisted phrase (case-insensitive substring)", () => {
  const rules = [{ type: "blacklist", pattern: "win a prize" }];
  const match = matchKeywordRule("You WIN A PRIZE today!", rules);
  assert.ok(match);
  assert.strictEqual(match.type, "blacklist");
});

test("matchKeywordRule returns null when no rule matches", () => {
  const rules = [{ type: "blacklist", pattern: "lottery" }];
  assert.strictEqual(matchKeywordRule("just a normal message", rules), null);
});

test("matchKeywordRule lets a whitelisted phrase override a blacklist match", () => {
  const rules = [
    { type: "blacklist", pattern: "invoice" },
    { type: "whitelist", pattern: "from accounting" },
  ];
  const match = matchKeywordRule("Invoice attached, from accounting team", rules);
  assert.ok(match);
  assert.strictEqual(match.type, "whitelist");
});

test("matchKeywordRule handles empty/invalid inputs safely", () => {
  assert.strictEqual(matchKeywordRule("", [{ type: "blacklist", pattern: "x" }]), null);
  assert.strictEqual(matchKeywordRule("text", []), null);
  assert.strictEqual(matchKeywordRule("text", null), null);
  assert.strictEqual(matchKeywordRule(null, [{ type: "blacklist", pattern: "x" }]), null);
});
