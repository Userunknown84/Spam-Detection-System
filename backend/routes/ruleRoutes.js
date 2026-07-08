const express = require("express");
const router = express.Router();
const { getRules, addRule, deleteRule } = require("../controllers/ruleController");
const { protect } = require("../middleware/authMiddleware");

// All rules routes are protected by auth middleware
router.use(protect);

router.get("/", getRules);
router.post("/", addRule);
router.delete("/:id", deleteRule);

module.exports = router;
