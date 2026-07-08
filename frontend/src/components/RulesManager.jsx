import { useState, useEffect } from "react";
import api from "../utils/axiosInstance";
import { useTheme } from "../context/ThemeContext";

export default function RulesManager() {
  const { isDark, activeTheme } = useTheme();
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pattern, setPattern] = useState("");
  const [type, setType] = useState("blacklist");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const fetchRules = async () => {
    try {
      setLoading(true);
      const res = await api.get("/api/v1/rules");
      setRules(res.data.data || []);
    } catch (err) {
      console.error("Failed to fetch rules:", err);
      setError("Failed to load rules.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const handleAddRule = async (e) => {
    e.preventDefault();
    if (!pattern.trim()) return;

    setError("");
    setSuccess("");
    setActionLoading(true);

    try {
      const res = await api.post("/api/v1/rules", {
        pattern: pattern.trim(),
        type,
      });

      setRules((prev) => [res.data.data, ...prev]);
      setPattern("");
      setSuccess("Rule added successfully!");
      
      // Auto-clear success message
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to add rule.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteRule = async (id) => {
    setError("");
    setSuccess("");
    try {
      await api.delete(`/api/v1/rules/${id}`);
      setRules((prev) => prev.filter((r) => r._id !== id));
      setSuccess("Rule deleted successfully.");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to delete rule.");
    }
  };

  return (
    <div className="text-left w-full max-w-xl mx-auto">
      <h2 className="text-2xl font-extrabold mb-2 flex items-center gap-2">
        🛡️ Rules Manager
      </h2>
      <p className="text-xs opacity-75 mb-6">
        Specify email addresses or domains to always whitelist (safe) or blacklist (spam), bypassing ML predictions.
      </p>

      {/* Add New Rule Form */}
      <form onSubmit={handleAddRule} className="mb-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-xs font-bold mb-1.5 opacity-80">
              Email / Domain Pattern
            </label>
            <input
              type="text"
              placeholder="e.g. user@domain.com or @domain.com"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              className={`w-full p-3 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-all ${
                isDark ? activeTheme.inputDark : activeTheme.input
              }`}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold mb-1.5 opacity-80">
              Action Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className={`w-full p-3 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-all ${
                isDark ? activeTheme.inputDark : activeTheme.input
              }`}
            >
              <option value="blacklist">🚫 Blacklist</option>
              <option value="whitelist">✅ Whitelist</option>
            </select>
          </div>
        </div>

        <button
          type="submit"
          disabled={actionLoading || !pattern.trim()}
          className={`w-full py-3 rounded-xl font-bold text-white shadow-md active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
            activeTheme.accent
          }`}
        >
          {actionLoading ? "Adding..." : "Add Override Rule"}
        </button>
      </form>

      {/* Success/Error Alerts */}
      {success && (
        <div className="mb-4 p-3 rounded-xl bg-green-500/10 border border-green-500/30 text-green-600 dark:text-green-400 text-sm font-semibold">
          {success}
        </div>
      )}
      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-sm font-semibold">
          {error}
        </div>
      )}

      {/* Rules List */}
      <div className="mt-6">
        <h3 className="text-lg font-bold mb-3">Active Rules</h3>
        {loading ? (
          <p className="text-sm opacity-60 animate-pulse">Loading rules...</p>
        ) : rules.length === 0 ? (
          <p className="text-sm opacity-65 italic">No rules defined yet. Add one above!</p>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {rules.map((rule) => (
              <div
                key={rule._id}
                className={`flex items-center justify-between p-3.5 rounded-xl border transition-all ${
                  isDark
                    ? "bg-slate-900/60 border-slate-700/60 text-slate-100"
                    : "bg-white/40 border-slate-200/50 text-slate-800"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                      rule.type === "blacklist"
                        ? "bg-red-500/15 text-red-500"
                        : "bg-green-500/15 text-green-500"
                    }`}
                  >
                    {rule.type === "blacklist" ? "🚫 Blacklist" : "✅ Whitelist"}
                  </span>
                  <span className="font-mono text-sm">{rule.pattern}</span>
                </div>
                <button
                  onClick={() => handleDeleteRule(rule._id)}
                  className="text-red-505 hover:text-red-600 transition-all font-semibold text-xs active:scale-95 px-2 py-1 rounded-lg hover:bg-red-500/10"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
