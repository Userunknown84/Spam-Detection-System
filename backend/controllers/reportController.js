const { generatePdfReport } = require("../utils/pdfGenerator");
const History = require("../models/History");
const mongoose = require("mongoose");

const exportPdfReport = async (req, res) => {
  try {
    const [analytics] = await History.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(req.user.id),
        },
      },
      {
        $group: {
          _id: null,

          total: {
            $sum: 1,
          },

          spam: {
            $sum: {
              $cond: [
                {
                  $in: [
                    "$prediction",
                    ["spam", "smishing", "malicious"],
                  ],
                },
                1,
                0,
              ],
            },
          },

          nonSpam: {
            $sum: {
              $cond: [
                {
                  $in: [
                    "$prediction",
                    ["ham", "safe"],
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);

    const total = analytics?.total || 0;
    const spam = analytics?.spam || 0;
    const nonSpam = analytics?.nonSpam || 0;

    const spamPercentage =
      total > 0 ? (spam / total) * 100 : 0;

    const analyticsData = {
      total,
      spam,
      nonSpam,
      spamPercentage,
    };

    await generatePdfReport(req, res, analyticsData);
  } catch (error) {
    console.error("Export PDF Error:", error);
    res.status(500).json({
      error: "Server error while generating PDF report",
    });
  }
};

const exportReport = async (req, res) => {
  try {
    const { format } = req.query;

    const [analytics] = await History.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(req.user.id),
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          spam: {
            $sum: {
              $cond: [
                {
                  $in: [
                    "$prediction",
                    ["spam", "smishing", "malicious"],
                  ],
                },
                1,
                0,
              ],
            },
          },
          nonSpam: {
            $sum: {
              $cond: [
                {
                  $in: [
                    "$prediction",
                    ["ham", "safe"],
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);

    const total = analytics?.total || 0;
    const spam = analytics?.spam || 0;
    const nonSpam = analytics?.nonSpam || 0;
    const spamPercentage = total > 0 ? (spam / total) * 100 : 0;

    const analyticsData = { total, spam, nonSpam, spamPercentage };

    if (format === 'txt') {
      const txtContent = `
Spam Detection Report
======================
Total Messages Processed: ${total}
Spam / Malicious Detected: ${spam}
Safe / Ham Messages: ${nonSpam}
Spam Percentage: ${spamPercentage.toFixed(2)}%
Generated on: ${new Date().toISOString()}
      `.trim();

      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', 'attachment; filename="report.txt"');
      return res.send(txtContent);
    }

    await generatePdfReport(req, res, analyticsData);

  } catch (error) {
    console.error("Export Error:", error);
    res.status(500).json({
      error: "Server error while generating report",
    });
  }
};


module.exports = {
  exportPdfReport,
  exportReport
};