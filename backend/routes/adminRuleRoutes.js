const express = require('express');
const router = express.Router();
const {
  getAdminRules,
  createAdminRule,
  updateAdminRule,
  deleteAdminRule
} = require('../controllers/adminRuleController');

const { protect, admin } = require('../middleware/authMiddleware');

// All admin rules routes require authentication and admin privileges
router.use(protect);
router.use(admin);

router
  .route('/')
  .get(getAdminRules)
  .post(createAdminRule);

router
  .route('/:id')
  .put(updateAdminRule)
  .delete(deleteAdminRule);

module.exports = router;
