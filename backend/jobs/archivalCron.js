const cron = require('node-cron');
const mongoose = require('mongoose');
const History = require('../models/History'); // Ensure this path matches your existing History model
const HistoryArchive = require('../models/HistoryArchive');

// Schedule job to run at 3:00 AM every day
// Run every minute for testing
    cron.schedule('* * * * *', async () => {
    console.log('📦 [Cron] Starting data archival process for records older than 90 days...');
    
    // Start a transaction session for safe data migration
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        // Calculate the date 90 days ago
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        // 1. Process records in batches to prevent OOM
        let processedCount = 0;
        while (true) {
            const batch = await History.find({ createdAt: { $lt: ninetyDaysAgo } })
                                       .limit(1000)
                                       .session(session);
            
            if (batch.length === 0) break;
            
            // 2. Bulk insert them into the Archive collection
            await HistoryArchive.insertMany(batch, { session });
            
            // 3. Bulk delete them from the main History collection
            const batchIds = batch.map(doc => doc._id);
            await History.deleteMany({ _id: { $in: batchIds } }, { session });
            
            processedCount += batch.length;
        }

        if (processedCount > 0) {
            console.log(`✅ [Cron] Successfully archived ${processedCount} records.`);
        } else {
            console.log('ℹ️ [Cron] No old records to archive today.');
        }

        // Commit transaction if both insert and delete succeed
        await session.commitTransaction();
    } catch (error) {
        // Abort if anything fails so we don't lose data!
        await session.abortTransaction();
        console.error('❌ [Cron] Archival process failed, rolling back changes:', error);
    } finally {
        session.endSession();
    }
});