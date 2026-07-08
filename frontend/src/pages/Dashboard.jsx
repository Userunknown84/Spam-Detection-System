import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useTheme } from "../context/ThemeContext";
import api from "../utils/axiosInstance";
import ActivityHeatmap from '../components/ActivityHeatmap';


const API_BASE = import.meta.env.VITE_PYTHON_URI || "http://127.0.0.1:5000";

// Known verdict labels the ML API can return (text -> ham/spam/smishing, url -> safe/malicious).
const LABEL_COLORS = {
  ham: "#22c55e",
  safe: "#16a34a",
  spam: "#ef4444",
  smishing: "#f97316",
  malicious: "#dc2626",
  offensive: "#ec4899",
};
const FALLBACK_COLORS = ["#3b82f6", "#f59e0b", "#8b5cf6", "#06b6d4"];
const colorForLabel = (label, idx) => LABEL_COLORS[label] || FALLBACK_COLORS[idx % FALLBACK_COLORS.length];

const TYPE_COLORS = ["#3b82f6", "#f59e0b", "#8b5cf6", "#10b981"];

function pivotTrends(rows) {
  const byDate = new Map();
  const labels = new Set();
  rows.forEach(({ date, label, count }) => {
    if (!byDate.has(date)) byDate.set(date, { date });
    byDate.get(date)[label] = count;
    labels.add(label);
  });
  return {
    data: Array.from(byDate.values()).sort((a, b) => (a.date > b.date ? 1 : -1)),
    labels: Array.from(labels),
  };
}

function pivotBreakdown(rows) {
  const byType = new Map();
  rows.forEach(({ type, count }) => {
    byType.set(type, (byType.get(type) || 0) + count);
  });
  return Array.from(byType, ([type, count]) => ({ type, count }));
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { isDark, activeTheme } = useTheme();

  const [summary, setSummary] = useState(null);
  const [trends, setTrends] = useState([]);
  const [trendLabels, setTrendLabels] = useState([]);
  const [breakdown, setBreakdown] = useState([]);
  const [range, setRange] = useState("daily");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [personalStats, setPersonalStats] = useState(null);

  const fetchAll = useCallback(async (selectedRange = range) => {
    setLoading(true);
    setError("");
    try {
      const [summaryRes, trendsRes, breakdownRes, meRes] = await Promise.all([
        api.get(`${API_BASE}/analytics/summary`),
        api.get(`${API_BASE}/analytics/trends`, { params: { range: selectedRange } }),
        api.get(`${API_BASE}/analytics/breakdown`),
        api.get("/api/v1/analytics/me"),
      ]);
      setSummary(summaryRes.data);
      const pivoted = pivotTrends(trendsRes.data);
      setTrends(pivoted.data);
      setTrendLabels(pivoted.labels);
      setBreakdown(pivotBreakdown(breakdownRes.data));
      setPersonalStats(meRes.data);
    } catch (err) {
      console.error(err);
      setError("Failed to load analytics data.");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleRangeChange = (e) => {
    const val = e.target.value;
    setRange(val);
    fetchAll(val);
  };

  const cards = summary
    ? [
        { label: "Total Scanned", value: summary.totalScanned, accent: "text-slate-500" },
        { label: "Threat %", value: `${summary.threatPercentage}%`, accent: "text-red-500" },
        { label: "Clean %", value: `${summary.cleanPercentage}%`, accent: "text-green-500" },
        { label: "Threats Detected", value: summary.threatCount, accent: "text-orange-500" },
      ]
    : [];

  const handleExportPDF = async () => {
    try {
      const token = localStorage.getItem('token');
      // Use standard axios if interceptor not attached to 'api' object or use 'api'
      const response = await api.get(`${API_BASE}/reports/export-pdf`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'spam_detection_report.pdf');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Error downloading PDF:', error);
      alert('Failed to download PDF report');
    }
  };

  return (
    <div
      className={`min-h-screen px-4 py-8 sm:px-8 transition-all duration-500 ${
        isDark ? activeTheme.dark : activeTheme.light
      }`}
    >
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white drop-shadow">
            📊 Spam Analytics Dashboard
          </h1>
          <div className="flex gap-3">
            <button
              onClick={() => navigate("/app")}
              className={`px-4 py-2.5 rounded-xl font-bold transition-all active:scale-95 shadow-md ${
                isDark
                  ? "bg-slate-800 text-white hover:bg-slate-700"
                  : "bg-white/35 text-slate-850 hover:bg-white/50"
              }`}
            >
              ← Back to Detector
            </button>
            <button
              onClick={handleExportPDF}
              className={`px-4 py-2.5 rounded-xl font-bold text-white shadow-md active:scale-95 transition-all bg-emerald-500 hover:bg-emerald-600`}
            >
              📄 Export PDF
            </button>
            <button
              onClick={() => fetchAll()}
              disabled={loading}
              className={`px-4 py-2.5 rounded-xl font-bold text-white shadow-md active:scale-95 transition-all ${activeTheme.accent}`}
            >
              {loading ? "Refreshing..." : "🔄 Refresh"}
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 mb-6 text-sm font-semibold rounded-xl bg-red-500/10 border border-red-500/35 text-red-100">
            ⚠️ {error}
          </div>
        )}

        {/* 🚀 New Personal Analytics Summary Widget */}
        {personalStats && (
          <div className={`mb-6 rounded-3xl p-6 shadow-xl border overflow-hidden relative ${isDark ? 'bg-gradient-to-r from-slate-900 to-slate-800 border-slate-700' : 'bg-gradient-to-r from-blue-50 to-indigo-50 border-indigo-100'}`}>
             <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 rounded-full bg-blue-500 opacity-10 blur-2xl"></div>
             
             <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
               <span className="text-2xl">👋</span> Your Spam Hunting Record
             </h2>
             
             <p className={`text-base md:text-lg font-medium leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
               You've scanned a total of <span className="font-black text-blue-500">{personalStats.total_predictions}</span> items. 
               We found <span className="font-bold text-red-500">{personalStats.spam_count} Spam</span>, <span className="font-bold text-orange-500">{personalStats.smishing_count} Smishing</span>, and verified <span className="font-bold text-green-500">{personalStats.ham_count} Safe</span> items.
             </p>
             
             {personalStats.most_recent && (
               <p className="text-xs opacity-60 mt-4 font-bold uppercase tracking-wider">
                 Last Scan: {new Date(personalStats.most_recent).toLocaleString()}
               </p>
             )}
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {(cards.length ? cards : Array.from({ length: 4 })).map((card, idx) => (
            <div
              key={idx}
              className={`rounded-2xl p-4 shadow-lg border text-center ${
                isDark ? activeTheme.cardDark : `${activeTheme.card} backdrop-blur-md`
              }`}
            >
              <p className="text-xs font-semibold opacity-70 mb-2">
                {card?.label || (loading ? "Loading..." : "—")}
              </p>
              <p className={`text-2xl font-extrabold ${card?.accent || ""}`}>
                {card ? card.value : "--"}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-6">
        <ActivityHeatmap userId={user?.id} darkMode={isDark} />
        </div>

        {/* Time-series chart */}
        <div
          className={`rounded-2xl p-4 sm:p-6 shadow-lg border mb-6 ${
            isDark ? activeTheme.cardDark : `${activeTheme.card} backdrop-blur-md`
          }`}
        >
          <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
            <h2 className="text-lg font-bold">Spam Volume Over Time</h2>
            <select
              value={range}
              onChange={handleRangeChange}
              disabled={loading}
              className={`p-2 rounded-xl border font-semibold text-xs focus:outline-none focus:ring-2 ${
                isDark ? activeTheme.inputDark : activeTheme.input
              }`}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          {trends.length === 0 && !loading ? (
            <p className="text-sm opacity-60 text-center py-10">No scan history yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trends}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                {trendLabels.map((label, idx) => (
                  <Line
                    key={label}
                    type="monotone"
                    dataKey={label}
                    stroke={colorForLabel(label, idx)}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Breakdown chart */}
        <div
          className={`rounded-2xl p-4 sm:p-6 shadow-lg border ${
            isDark ? activeTheme.cardDark : `${activeTheme.card} backdrop-blur-md`
          }`}
        >
          <h2 className="text-lg font-bold mb-4">Breakdown by Input Type</h2>

          {breakdown.length === 0 && !loading ? (
            <p className="text-sm opacity-60 text-center py-10">No scan history yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={breakdown}
                  dataKey="count"
                  nameKey="type"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ type, count }) => `${type}: ${count}`}
                >
                  {breakdown.map((entry, idx) => (
                    <Cell key={entry.type} fill={TYPE_COLORS[idx % TYPE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
