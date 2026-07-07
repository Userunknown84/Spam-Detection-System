import { useState, useEffect } from "react";
import api from "../utils/axiosInstance";

export default function FeedbackAnalytics({ darkMode }) {
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [summaryRes, historyRes] = await Promise.all([
          api.get("/feedback/summary"),
          api.get("/feedback/history"),
        ]);
        setSummary(summaryRes.data);
        const sortedHistory = (historyRes.data || []).sort((a, b) => {
          return new Date(b.submitted_at) - new Date(a.submitted_at);
        });
        setHistory(sortedHistory);
        setLoading(false);
      } catch (err) {
        setError(err.message || "Failed to fetch feedback analytics data");
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className={`mt-6 p-4 rounded-xl border text-center ${
        darkMode ? "bg-gray-800/70 border-gray-600 text-white" : "bg-white/40 border-white/30 text-black"
      }`}>
        <p className="text-sm text-gray-400 animate-pulse">Loading feedback analytics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`mt-6 p-4 rounded-xl border text-center ${
        darkMode ? "bg-gray-800/70 border-gray-600 text-white" : "bg-white/40 border-white/30 text-black"
      }`}>
        <p className="text-sm text-red-500">⚠️ Could not load analytics: {error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-left">
      {/* Summary Stats Grid */}
      <div className={`p-4 rounded-xl border ${
        darkMode ? "bg-gray-800/70 border-gray-600 text-white" : "bg-white/40 border-white/30 text-black"
      }`}>
        <h2 className="text-lg font-bold mb-4">📈 Feedback Accuracy</h2>
        
        <div className="grid grid-cols-2 gap-3">
          <div className={`p-3 rounded-lg border text-center ${darkMode ? "bg-gray-905 border-gray-700" : "bg-gray-100/40 border-gray-200"}`}>
            <p className="text-xs font-semibold opacity-70">Accuracy</p>
            <p className="text-2xl font-extrabold text-indigo-500">{summary?.accuracy_percentage}%</p>
          </div>
          <div className={`p-3 rounded-lg border text-center ${darkMode ? "bg-gray-905 border-gray-700" : "bg-gray-100/40 border-gray-200"}`}>
            <p className="text-xs font-semibold opacity-70">Total Feedback</p>
            <p className="text-2xl font-extrabold">{summary?.total_feedback}</p>
          </div>
          <div className={`p-3 rounded-lg border text-center ${darkMode ? "bg-gray-905 border-gray-700" : "bg-gray-100/40 border-gray-200"}`}>
            <p className="text-xs font-semibold opacity-70 text-green-500">Correct</p>
            <p className="text-xl font-bold text-green-500">{summary?.correct_predictions}</p>
          </div>
          <div className={`p-3 rounded-lg border text-center ${darkMode ? "bg-gray-905 border-gray-700" : "bg-gray-100/40 border-gray-200"}`}>
            <p className="text-xs font-semibold opacity-70 text-red-500">Incorrect</p>
            <p className="text-xl font-bold text-red-500">{summary?.incorrect_predictions}</p>
          </div>
          <div className={`p-3 rounded-lg border text-center ${darkMode ? "bg-gray-905 border-gray-700" : "bg-gray-100/40 border-gray-200"}`}>
            <p className="text-xs font-semibold opacity-70">False Positives</p>
            <p className="text-xl font-bold">{summary?.false_positives}</p>
          </div>
          <div className={`p-3 rounded-lg border text-center ${darkMode ? "bg-gray-905 border-gray-700" : "bg-gray-100/40 border-gray-200"}`}>
            <p className="text-xs font-semibold opacity-70">False Negatives</p>
            <p className="text-xl font-bold">{summary?.false_negatives}</p>
          </div>
        </div>
      </div>

      {/* Recent Feedback Entries */}
      <div className={`p-4 rounded-xl border ${
        darkMode ? "bg-gray-800/70 border-gray-600 text-white" : "bg-white/40 border-white/30 text-black"
      }`}>
        <h2 className="text-lg font-bold mb-3">📋 Recent Feedback Log</h2>
        
        {history.length === 0 ? (
          <p className="text-sm text-gray-400">No feedback submitted yet.</p>
        ) : (
          <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
            {history.slice(0, 10).map((entry, idx) => (
              <div key={idx} className={`p-3 rounded-lg border text-sm ${
                darkMode ? "bg-gray-905 border-gray-700" : "bg-gray-100/40 border-gray-200"
              }`}>
                <p className="font-medium truncate mb-1">"{entry.text}"</p>
                <div className="flex justify-between items-center text-xs opacity-80">
                  <div>
                    <span>Pred: <strong className={entry.predicted_label === "ham" ? "text-green-500" : "text-red-550"}>{entry.predicted_label}</strong></span>
                    <span className="mx-1">|</span>
                    {entry.is_correct ? (
                      <span className="text-green-500 font-semibold">✓ Correct</span>
                    ) : (
                      <span>Corr: <strong className="text-orange-500">{entry.correct_label}</strong></span>
                    )}
                  </div>
                  <span className="opacity-60 text-xxs">
                    {new Date(entry.submitted_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
