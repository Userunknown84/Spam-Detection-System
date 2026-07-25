const cron = require('node-cron');
const mongoose = require('mongoose');
const History = require('../models/History'); // Ensure this path matches your existing History model
const HistoryArchive = require('../models/HistoryArchive');

// Schedule job to run at 3:00 AM every day by default, configurable via environment variable
const schedule = process.env.ARCHIVAL_CRON_SCHEDULE || '0 3 * * *';

const archivalJob = async () => {
    console.log('📦 [Cron] Starting data archival process for records older than 90 days...');
    
    try {
        // Calculate the date 90 days ago
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        // 1. Process records in batches to prevent OOM
        let processedCount = 0;
        while (true) {
            const batch = await History.find({ createdAt: { $lt: ninetyDaysAgo } })
                                       .limit(1000)
<<<<<<< Updated upstream
                                       .lean();
            
            if (batch.length === 0) break;
            
            // 2. Prepare bulkWrite operations with upsert to make migration safely idempotent
            const bulkOps = batch.map(record => ({
                updateOne: {
                    filter: { _id: record._id },
                    update: {
                        $setOnInsert: {
                            _id: record._id,
                            userId: record.user,
                            message: record.query,
                            prediction: record.prediction,
                            confidenceScore: record.confidence,
                            createdAt: record.createdAt
                        }
                    },
                    upsert: true
                }
            }));

            // Execute the bulk write to the Archive collection
            try {
                await HistoryArchive.bulkWrite(bulkOps);
            } catch (writeError) {
                console.error('❌ [Cron] Failed to write archival records batch to HistoryArchive:', writeError);
                throw writeError; // Rethrow to stop processing and avoid deleting source records
            }
            
            // 3. Bulk delete them from the main History collection only after successful archival write
            const batchIds = batch.map(doc => doc._id);
            try {
                await History.deleteMany({ _id: { $in: batchIds } });
            } catch (deleteError) {
                console.error('❌ [Cron] Failed to delete archived records batch from History:', deleteError);
                throw deleteError; // Rethrow since the state is now partially migrated but safe for retry
            }
=======
                                       .session(session);
            
            if (batch.length === 0) break;
            
            // Map the old records to the new schema
            const mappedRecords = batch.map(record => ({
                userId: record.user,
                message: record.query,
                prediction: record.prediction,
                confidenceScore: record.confidence,
                createdAt: record.createdAt
            }));

            // 2. Bulk insert them into the Archive collection
            await HistoryArchive.insertMany(mappedRecords, { session });
            
            // 3. Bulk delete them from the main History collection
            const batchIds = batch.map(doc => doc._id);
            await History.deleteMany({ _id: { $in: batchIds } }, { session });
>>>>>>> Stashed changes
            
            processedCount += batch.length;
        }

        if (processedCount > 0) {
            console.log(`✅ [Cron] Successfully archived ${processedCount} records.`);
        } else {
            console.log('ℹ️ [Cron] No old records to archive today.');
        }

    } catch (error) {
        console.error('❌ [Cron] Archival process encountered an error:', error);
    }
};

cron.schedule(schedule, archivalJob);

module.exports = { archivalJob, schedule };