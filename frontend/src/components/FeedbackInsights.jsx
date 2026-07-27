import React, { useState, useEffect } from 'react';
import { useTheme } from "../context/ThemeContext";
import api from "../utils/axiosInstance";

// Surfaces the feedback collected via FeedbackWidget (issue #823's
// thumbs-up/down flow), which was previously write-only - submitted to
// /feedback and only ever consumed again by retrain.py, with no way to see
// what had been collected without opening feedback_store.csv by hand.
export default function FeedbackInsights() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { isDark, activeTheme } = useTheme();

  const fetchStats = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get(`${import.meta.env.VITE_API_URI || ""}/feedback/stats`);
      setStats(res.data);
    } catch (err) {
      console.error(err);
      setError("Failed to load feedback insights.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  return (
    <div className="flex flex-col gap-4 text-left mt-6">
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <h3 className="text-[10px] font-extrabold uppercase tracking-wider opacity-70">
          User Feedback
        </h3>
        <button
          onClick={fetchStats}
          disabled={loading}
          className={`px-4 py-2.5 rounded-xl font-bold text-white shadow-md active:scale-95 transition-all text-xs ${activeTheme.accent}`}
        >
          {loading ? "Refreshing..." : "🔄 Refresh"}
        </button>
      </div>

      {error && (
        <div className="p-3 text-xs font-semibold rounded-xl bg-red-500/10 border border-red-500/35 text-red-500">
          ⚠️ {error}
        </div>
      )}

      {loading && !stats && (
        <div className="text-center py-10 opacity-70 text-xs font-bold">
          Loading feedback insights...
        </div>
      )}

      {stats && (
        <div className="border border-slate-350/20 rounded-2xl p-4 bg-slate-500/5 transition-all duration-300">
          <div className="grid grid-cols-3 gap-2 text-[10px] mb-4">
            <div className={`p-2.5 rounded-xl border text-center ${isDark ? "bg-slate-900/30 border-slate-800" : "bg-white/40 border-slate-200"}`}>
              <span className="text-[9px] font-bold block opacity-60 mb-1.5 uppercase">Total Feedback</span>
              <span className="text-lg font-extrabold">{stats.total}</span>
            </div>
            <div className={`p-2.5 rounded-xl border text-center ${isDark ? "bg-slate-900/30 border-slate-800" : "bg-white/40 border-slate-200"}`}>
              <span className="text-[9px] font-bold block opacity-60 mb-1.5 uppercase">Corrections</span>
              <span className="text-lg font-extrabold">{stats.corrections}</span>
            </div>
            <div className={`p-2.5 rounded-xl border text-center ${isDark ? "bg-slate-900/30 border-slate-800" : "bg-white/40 border-slate-200"}`}>
              <span className="text-[9px] font-bold block opacity-60 mb-1.5 uppercase">Correction Rate</span>
              <span className="text-lg font-extrabold">{Math.round(stats.correction_rate * 100)}%</span>
            </div>
          </div>

          <h3 className="text-[10px] font-extrabold uppercase tracking-wider mb-2 opacity-70">By Predicted Label</h3>
          <div className={`border rounded-xl overflow-hidden mb-4 ${isDark ? "border-slate-800" : "border-slate-200"}`}>
            <table className="w-full text-[10px] text-left border-collapse">
              <thead>
                <tr className={`border-b ${isDark ? "bg-slate-900/50 border-slate-800 text-slate-400" : "bg-slate-50 border-slate-200 text-slate-600"}`}>
                  <th className="p-2 font-bold">Predicted As</th>
                  <th className="p-2 font-bold w-16 text-right">Total</th>
                  <th className="p-2 font-bold w-20 text-right">Corrected</th>
                  <th className="p-2 font-bold">Corrected To</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(stats.by_predicted_label).length > 0 ? (
                  Object.entries(stats.by_predicted_label).map(([label, row]) => (
                    <tr key={label} className={`border-b last:border-b-0 ${isDark ? "border-slate-850" : "border-slate-150"}`}>
                      <td className="p-2 font-medium capitalize">{label}</td>
                      <td className="p-2 text-right font-bold text-slate-500">{row.total}</td>
                      <td className="p-2 text-right font-bold text-slate-500">{row.corrections}</td>
                      <td className="p-2">
                        {Object.entries(row.corrected_to).map(([to, count]) => (
                          <span key={to} className="mr-2 opacity-75">{to} ({count})</span>
                        ))}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="4" className="p-2 text-center opacity-60">No feedback recorded yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <h3 className="text-[10px] font-extrabold uppercase tracking-wider mb-2 opacity-70">Recent Submissions</h3>
          <div className={`border rounded-xl overflow-hidden ${isDark ? "border-slate-800" : "border-slate-200"}`}>
            <table className="w-full text-[10px] text-left border-collapse">
              <thead>
                <tr className={`border-b ${isDark ? "bg-slate-900/50 border-slate-800 text-slate-400" : "bg-slate-50 border-slate-200 text-slate-600"}`}>
                  <th className="p-2 font-bold">Text</th>
                  <th className="p-2 font-bold">Predicted</th>
                  <th className="p-2 font-bold">Corrected</th>
                  <th className="p-2 font-bold">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent.length > 0 ? (
                  stats.recent.map((entry, idx) => (
                    <tr key={idx} className={`border-b last:border-b-0 ${isDark ? "border-slate-850" : "border-slate-150"}`}>
                      <td className="p-2 font-medium">{entry.text_preview}</td>
                      <td className="p-2 capitalize">{entry.predicted_label}</td>
                      <td className="p-2 capitalize">{entry.correct_label}</td>
                      <td className="p-2 opacity-60">
                        {entry.submitted_at ? new Date(entry.submitted_at).toLocaleString() : ""}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="4" className="p-2 text-center opacity-60">No feedback recorded yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
