const Rule = require("../models/Rule");
const { validateKeywordPattern } = require("../utils/keywordRules");
const { getPaginationParams } = require("../utils/pagination");
const mongoose = require("mongoose");

// Get all rules for the logged-in user
const getRules = async (req, res) => {
  try {
    const { page, safeLimit, skip } = getPaginationParams(req.query, 100, 100);

    const total = await Rule.countDocuments({ user: req.user.id });
    const rules = await Rule.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit);

    res.json({
      success: true,
      data: rules,
      pagination: {
        total,
        page,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit),
      }
    });
  } catch (err) {
    console.error("Get rules error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// Add a new rule
const addRule = async (req, res) => {
  try {
    const { type, pattern, ruleCategory } = req.body;

    if (!type || !pattern) {
      return res.status(400).json({ error: "Type and pattern are required" });
    }

    const lowerType = type.toLowerCase();
    if (lowerType !== "blacklist" && lowerType !== "whitelist") {
      return res.status(400).json({ error: "Type must be either blacklist or whitelist" });
    }

    // Default to sender rules so existing clients keep working unchanged.
    const category = (ruleCategory || "sender").toLowerCase();
    if (category !== "sender" && category !== "keyword") {
      return res.status(400).json({ error: "ruleCategory must be either sender or keyword" });
    }

    let trimmedPattern;
    if (category === "keyword") {
      // Keyword rules match message content: any non-empty string within the
      // length limit is valid (no email/domain shape required).
      const result = validateKeywordPattern(pattern);
      if (!result.valid) {
        return res.status(400).json({ error: result.error });
      }
      trimmedPattern = result.value;
    } else {
      trimmedPattern = pattern.trim().toLowerCase();
      if (!trimmedPattern) {
        return res.status(400).json({ error: "Pattern cannot be empty" });
      }

      // Validate pattern: check if it's a valid email or domain
      const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedPattern);
      const isValidDomain = /^(?:@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)|(?:[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)$/.test(trimmedPattern);

      if (!isValidEmail && !isValidDomain) {
        return res.status(400).json({ error: "Pattern must be a valid email address (e.g. user@domain.com) or domain (e.g. @domain.com or domain.com)" });
      }
    }

    // Enforce a hard limit on maximum rules per user to prevent storage
    // exhaustion. The cap is shared across sender and keyword rules.
    const ruleCount = await Rule.countDocuments({ user: req.user.id });
    if (ruleCount >= 500) {
      return res.status(400).json({ error: "Maximum rule limit reached (500). Please delete some old rules before adding new ones." });
    }

    // Check if the rule already exists
    const existingRule = await Rule.findOne({
      user: req.user.id,
      ruleCategory: category,
      type: lowerType,
      pattern: trimmedPattern,
    });

    if (existingRule) {
      return res.status(400).json({ error: "This rule already exists" });
    }

    const newRule = await Rule.create({
      user: req.user.id,
      ruleCategory: category,
      type: lowerType,
      pattern: trimmedPattern,
    });
    
    res.status(201).json({
      success: true,
      data: newRule,
    });
  } catch (err) {
    console.error("Add rule error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// Delete a rule
const deleteRule = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "Invalid rule id" });
  }

  try {
    const rule = await Rule.findOneAndDelete({
      _id: req.params.id,
      user: req.user.id,
    });

    if (!rule) {
      return res.status(404).json({ error: "Rule not found" });
    }

    res.json({
      success: true,
      message: "Rule deleted successfully",
    });
  } catch (err) {
    console.error("Delete rule error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

module.exports = {
  getRules,
  addRule,
  deleteRule,
};
