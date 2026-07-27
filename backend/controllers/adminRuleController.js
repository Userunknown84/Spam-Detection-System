const AdminRule = require('../models/AdminRule');
const { refreshAdminRulesCache } = require('../utils/adminRuleEvaluator');

/**
 * @desc    Get all admin rules
 * @route   GET /api/v1/admin/rules
 * @access  Private/Admin
 */
const getAdminRules = async (req, res) => {
  try {
    const rules = await AdminRule.find({})
      .sort({ priority: -1, createdAt: -1 })
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email');
      
    res.status(200).json({
      success: true,
      count: rules.length,
      data: rules
    });
  } catch (error) {
    console.error('Error fetching admin rules:', error);
    res.status(500).json({ success: false, error: 'Server error while fetching rules' });
  }
};

/**
 * @desc    Create an admin rule
 * @route   POST /api/v1/admin/rules
 * @access  Private/Admin
 */
const createAdminRule = async (req, res) => {
  try {
    const { pattern, type, action, enabled, priority, description } = req.body;

    const rule = new AdminRule({
      pattern,
      type,
      action,
      enabled,
      priority,
      description,
      createdBy: req.user.id,
      updatedBy: req.user.id
    });

    await rule.save();
    
    // Refresh cache asynchronously (no await needed for response)
    refreshAdminRulesCache();

    res.status(201).json({
      success: true,
      data: rule
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ success: false, error: messages.join(', ') });
    }
    console.error('Error creating admin rule:', error);
    res.status(500).json({ success: false, error: 'Server error while creating rule' });
  }
};

/**
 * @desc    Update an admin rule
 * @route   PUT /api/v1/admin/rules/:id
 * @access  Private/Admin
 */
const updateAdminRule = async (req, res) => {
  try {
    const rule = await AdminRule.findById(req.params.id);

    if (!rule) {
      return res.status(404).json({ success: false, error: 'Rule not found' });
    }

    const { pattern, type, action, enabled, priority, description } = req.body;

    if (pattern !== undefined) rule.pattern = pattern;
    if (type !== undefined) rule.type = type;
    if (action !== undefined) rule.action = action;
    if (enabled !== undefined) rule.enabled = enabled;
    if (priority !== undefined) rule.priority = priority;
    if (description !== undefined) rule.description = description;
    
    rule.updatedBy = req.user.id;

    await rule.save();

    // Refresh cache
    refreshAdminRulesCache();

    res.status(200).json({
      success: true,
      data: rule
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ success: false, error: messages.join(', ') });
    }
    console.error('Error updating admin rule:', error);
    res.status(500).json({ success: false, error: 'Server error while updating rule' });
  }
};

/**
 * @desc    Delete an admin rule
 * @route   DELETE /api/v1/admin/rules/:id
 * @access  Private/Admin
 */
const deleteAdminRule = async (req, res) => {
  try {
    const rule = await AdminRule.findById(req.params.id);

    if (!rule) {
      return res.status(404).json({ success: false, error: 'Rule not found' });
    }

    await rule.deleteOne();

    // Refresh cache
    refreshAdminRulesCache();

    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (error) {
    console.error('Error deleting admin rule:', error);
    res.status(500).json({ success: false, error: 'Server error while deleting rule' });
  }
};

module.exports = {
  getAdminRules,
  createAdminRule,
  updateAdminRule,
  deleteAdminRule
};
