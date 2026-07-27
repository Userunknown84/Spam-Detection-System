import React, { useState, useEffect } from 'react';
import { useTheme } from "../context/ThemeContext";
import api from "../utils/axiosInstance";
import { SpamTrends } from './SpamTrends';
import { RecentActivity } from './RecentActivity';
import { RateLimitDashboard } from './RateLimitDashboard';


export default function SpamInsightsDashboard() {
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("");
  const { isDark, activeTheme } = useTheme();

  const fetchInsights = async (cat = category) => {
    setLoading(true);
    setError("");
    try {
      const url = cat
        ? `/spam-insights?category=${cat}`
        : "/spam-insights";
      const res = await api.get(url);
      setInsights(res.data);
    } catch (err) {
      console.error(err);
      setError("Failed to load spam pattern insights.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInsights();
  }, []);

  const handleCategoryChange = (e) => {
    const val = e.target.value;
    setCategory(val);
    fetchInsights(val);
  };

  return (
    <div className="flex flex-col gap-4 text-left mt-2">
      <div>
        <p className="font-semibold text-xs opacity-75 text-center mb-4 leading-relaxed">
          Discover common keywords, phrases, and indicators that drive classifier alerts.
        </p>

        {/* Filter & Refresh Controls */}
        <div className="flex justify-between items-center gap-3 mb-4 flex-wrap">
          <div className="flex-1 min-w-[150px]">
            <select
              value={category}
              onChange={handleCategoryChange}
              disabled={loading}
              className={`w-full p-2.5 rounded-xl border font-semibold focus:outline-none focus:ring-2 transition-all text-xs ${
                isDark ? activeTheme.inputDark : activeTheme.input
              }`}
            >
              <option value="">All Threat Categories</option>
              <option value="spam">Spam Indicator patterns</option>
              <option value="smishing">Smishing/Phishing patterns</option>
              <option value="offensive">Offensive Content patterns</option>
            </select>
          </div>
          
          <button
            onClick={() => fetchInsights()}
            disabled={loading}
            className={`px-4 py-2.5 rounded-xl font-bold text-white shadow-md active:scale-95 transition-all text-xs ${activeTheme.accent}`}
          >
            {loading ? "Refreshing..." : "🔄 Refresh"}
          </button>
        </div>

        {error && (
          <div className="p-3 mb-4 text-xs font-semibold rounded-xl bg-red-500/10 border border-red-500/35 text-red-500">
            ⚠️ {error}
          </div>
        )}
      </div>

      {loading && !insights && (
        <div className="text-center py-10 opacity-70 text-xs font-bold">
          Analyzing message patterns...
        </div>
      )}

      {insights && (
        <div className="border border-slate-350/20 rounded-2xl p-4 bg-slate-500/5 transition-all duration-300">
          {/* Category Indicators Row */}
          <h3 className="text-[10px] font-extrabold uppercase tracking-wider mb-2 opacity-70">Category Indicators</h3>
          <div className="grid grid-cols-3 gap-2 text-[10px] mb-4">
            <div className={`p-2.5 rounded-xl border text-center ${isDark ? "bg-slate-900/30 border-slate-800" : "bg-white/40 border-slate-200"}`}>
              <span className="text-[9px] font-bold block opacity-60 mb-1.5 text-red-600 dark:text-red-400 uppercase">Spam</span>
              <div className="flex flex-wrap gap-1 justify-center">
                {insights.category_indicators.spam?.map((ind, idx) => (
                  <span key={idx} className="bg-red-500/10 px-1 py-0.5 rounded font-semibold text-[8px] text-red-650 dark:text-red-300">
                    {ind}
                  </span>
                ))}
              </div>
            </div>
            
            <div className={`p-2.5 rounded-xl border text-center ${isDark ? "bg-slate-900/30 border-slate-800" : "bg-white/40 border-slate-200"}`}>
              <span className="text-[9px] font-bold block opacity-60 mb-1.5 text-orange-600 dark:text-orange-400 uppercase">Smishing</span>
              <div className="flex flex-wrap gap-1 justify-center">
                {insights.category_indicators.smishing?.map((ind, idx) => (
                  <span key={idx} className="bg-orange-500/10 px-1 py-0.5 rounded font-semibold text-[8px] text-orange-600 dark:text-orange-300">
                    {ind}
                  </span>
                ))}
              </div>
            </div>
            
            <div className={`p-2.5 rounded-xl border text-center ${isDark ? "bg-slate-900/30 border-slate-800" : "bg-white/40 border-slate-200"}`}>
              <span className="text-[9px] font-bold block opacity-60 mb-1.5 text-pink-600 dark:text-pink-400 uppercase">Offensive</span>
              <div className="flex flex-wrap gap-1 justify-center">
                {insights.category_indicators.offensive?.map((ind, idx) => (
                  <span key={idx} className="bg-pink-500/10 px-1 py-0.5 rounded font-semibold text-[8px] text-pink-600 dark:text-pink-300">
                    {ind}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Keywords and Phrases Tables */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* Top Keywords */}
            <div>
              <h3 className="text-[10px] font-extrabold uppercase tracking-wider mb-2 opacity-70">Top Keywords</h3>
              <div className={`border rounded-xl overflow-hidden ${isDark ? "border-slate-800" : "border-slate-200"}`}>
                <table className="w-full text-[10px] text-left border-collapse">
                  <thead>
                    <tr className={`border-b ${isDark ? "bg-slate-900/50 border-slate-800 text-slate-400" : "bg-slate-50 border-slate-200 text-slate-600"}`}>
                      <th className="p-2 font-bold">Keyword</th>
                      <th className="p-2 font-bold w-16 text-right">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {insights.top_keywords.length > 0 ? (
                      insights.top_keywords.map((item, idx) => (
                        <tr key={idx} className={`border-b last:border-b-0 ${isDark ? "border-slate-850" : "border-slate-150"}`}>
                          <td className="p-2 font-medium">{item.keyword}</td>
                          <td className="p-2 text-right font-bold text-slate-500">{item.count}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="2" className="p-2 text-center opacity-60">No keywords recorded yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Trending Phrases */}
            <div>
              <h3 className="text-[10px] font-extrabold uppercase tracking-wider mb-2 opacity-70">Trending Phrases</h3>
              <div className={`border rounded-xl overflow-hidden ${isDark ? "border-slate-800" : "border-slate-200"}`}>
                <table className="w-full text-[10px] text-left border-collapse">
                  <thead>
                    <tr className={`border-b ${isDark ? "bg-slate-900/50 border-slate-800 text-slate-400" : "bg-slate-50 border-slate-200 text-slate-600"}`}>
                      <th className="p-2 font-bold">Phrase</th>
                      <th className="p-2 font-bold w-16 text-right">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {insights.trending_phrases.length > 0 ? (
                      insights.trending_phrases.map((item, idx) => (
                        <tr key={idx} className={`border-b last:border-b-0 ${isDark ? "border-slate-850" : "border-slate-150"}`}>
                          <td className="p-2 font-medium">{item.phrase}</td>
                          <td className="p-2 text-right font-bold text-slate-500">{item.count}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="2" className="p-2 text-center opacity-60">No phrases detected yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="dashboard-section">
             <SpamTrends />
          </div>

          <div className="dashboard-section">
             <RecentActivity />
          </div>

          <div className="dashboard-section">
             <RateLimitDashboard />
          </div>



          {/* Recent Suspicious Terms */}
          <h3 className="text-[10px] font-extrabold uppercase tracking-wider mb-2 opacity-70">Recently Detected Terms</h3>
          <div className="flex flex-wrap gap-1.5">
            {insights.recent_suspicious_terms.length > 0 ? (
              insights.recent_suspicious_terms.map((term, idx) => (
                <span
                  key={idx}
                  className={`px-2 py-1 rounded text-[9px] font-bold border transition-all ${
                    isDark
                      ? "bg-slate-900/40 border-slate-800 text-slate-300"
                      : "bg-white/40 border-slate-200 text-slate-700"
                  }`}
                >
                  ⚠️ {term}
                </span>
              ))
            ) : (
              <span className="opacity-60 text-[10px]">No recent terms.</span>
            )}
          </div>
        </div>
      )}

      <FeedbackInsights />
    </div>
  );
}
