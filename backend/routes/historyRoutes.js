const express = require("express");
const router = express.Router();

const {
  getHistory,
  searchHistory,
  deleteHistoryItem,
  clearHistory,
  bulkDeleteHistory,
  getHistoryCount,
} = require("../controllers/historyController");

const { protect } = require("../middleware/authMiddleware");

router.use(protect);

// Get logged-in user's history
router.get("/", getHistory);

// Search user's history
router.get("/search", searchHistory);

// Bulk delete history items
router.delete("/bulk-delete", bulkDeleteHistory);

// Delete one history item
router.delete("/:id", deleteHistoryItem);

// Clear all history
router.delete("/", clearHistory);

router.get('/count', getHistoryCount);
module.exports = router;

router.get('/recent',protect, async(req,res)=> {
  try{
    const predictions= await Prediction.find({userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('text result createdAt');

      res.json(predictions);
  }catch(error){
    res.status(500).json({ error: 'Failed to fetch recent activity' });
  }
    });

router.get('/',protect,async(req,res) => {
  try{
    const{startDate, endDate, limit =50 } =req.query;

    const filter = { userId: req.user.id};

    if(startDate){
      filter.createdAt = { ...filter.createdAt, $gte: new Date(startDate) };
    }
    if(endDate){
      filter.createdAt = { ...filter.createdAt, $lte: new Date(endDate + 'T23:59:59') };
    }
    const predictions = await Prediction.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));
    
    res.json(predictions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});