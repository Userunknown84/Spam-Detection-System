import { useState, useEffect } from "react";
import api from "../utils/axiosInstance";
import { useTheme } from "../context/ThemeContext";

export default function AdminRulesManager() {
  const { isDark, activeTheme } = useTheme();
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [pattern, setPattern] = useState("");
  const [type, setType] = useState("keyword");
  const [action, setAction] = useState("spam");
  const [priority, setPriority] = useState(0);
  const [description, setDescription] = useState("");
  
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const fetchRules = async () => {
    try {
      setLoading(true);
      const res = await api.get("/api/v1/admin/rules");
      setRules(res.data.data || []);
    } catch (err) {
      console.error("Failed to fetch admin rules:", err);
      setError("Failed to load admin rules.");
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
      const res = await api.post("/api/v1/admin/rules", {
        pattern: pattern.trim(),
        type,
        action,
        priority: Number(priority),
        description: description.trim()
      });

      setRules((prev) => [res.data.data, ...prev].sort((a, b) => b.priority - a.priority));
      setPattern("");
      setDescription("");
      setSuccess("Admin rule added successfully!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to add admin rule.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleRule = async (rule) => {
    setError("");
    setSuccess("");
    try {
      const res = await api.put(`/api/v1/admin/rules/${rule._id}`, {
        enabled: !rule.enabled
      });
      setRules((prev) => prev.map(r => r._id === rule._id ? res.data.data : r));
      setSuccess(`Rule ${rule.enabled ? 'disabled' : 'enabled'} successfully.`);
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to toggle rule.");
    }
  };

  const handleDeleteRule = async (id) => {
    if (!window.confirm("Are you sure you want to delete this global rule?")) return;
    setError("");
    setSuccess("");
    try {
      await api.delete(`/api/v1/admin/rules/${id}`);
      setRules((prev) => prev.filter((r) => r._id !== id));
      setSuccess("Admin rule deleted successfully.");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to delete admin rule.");
    }
  };

  return (
    <div className="text-left w-full mx-auto">
      <h2 className="text-2xl font-extrabold mb-2 flex items-center gap-2 text-purple-500">
        🛡️ Global Admin Rules Engine
      </h2>
      <p className="text-xs opacity-75 mb-6">
        Define global overrides evaluated before ML inference. <strong>Warning: These rules apply to all users.</strong>
      </p>

      {/* Add New Rule Form */}
      <form onSubmit={handleAddRule} className={`mb-6 space-y-4 p-4 rounded-xl border ${isDark ? 'bg-slate-900/50 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
        <h3 className="text-sm font-bold mb-3">Add New Override Rule</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold mb-1.5 opacity-80">Pattern</label>
            <input
              type="text"
              placeholder="e.g. ^spam.* or suspicious.com"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              className={`w-full p-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 ${isDark ? activeTheme.inputDark : activeTheme.input}`}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-bold mb-1.5 opacity-80">Description (Optional)</label>
            <input
              type="text"
              placeholder="Reason for rule"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={`w-full p-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 ${isDark ? activeTheme.inputDark : activeTheme.input}`}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold mb-1.5 opacity-80">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className={`w-full p-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 ${isDark ? activeTheme.inputDark : activeTheme.input}`}
            >
              <option value="regex">Regex (Use with caution)</option>
              <option value="keyword">Exact Keyword Match</option>
              <option value="domain">Domain Match</option>
              <option value="url">URL Match</option>
              <option value="email">Email Match</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold mb-1.5 opacity-80">Action</label>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className={`w-full p-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 ${isDark ? activeTheme.inputDark : activeTheme.input}`}
            >
              <option value="spam">🔴 Mark as Spam</option>
              <option value="malicious">🛑 Mark as Malicious</option>
              <option value="smishing">📱 Mark as Smishing</option>
              <option value="ham">🟢 Mark as Ham (Safe)</option>
              <option value="safe">✅ Mark as Safe (URL)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold mb-1.5 opacity-80">Priority (Higher = First)</label>
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className={`w-full p-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 ${isDark ? activeTheme.inputDark : activeTheme.input}`}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={actionLoading || !pattern.trim()}
          className="w-full mt-2 py-2.5 rounded-lg font-bold text-white shadow-md active:scale-95 transition-all bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {actionLoading ? "Saving..." : "Create Global Rule"}
        </button>
      </form>

      {/* Alerts */}
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
        <h3 className="text-lg font-bold mb-3">Global Rules List</h3>
        {loading ? (
          <p className="text-sm opacity-60 animate-pulse">Loading admin rules...</p>
        ) : rules.length === 0 ? (
          <p className="text-sm opacity-65 italic">No admin rules defined.</p>
        ) : (
          <div className="space-y-3 overflow-y-auto pr-1" style={{ maxHeight: "400px" }}>
            {rules.map((rule) => (
              <div
                key={rule._id}
                className={`flex flex-col p-4 rounded-xl border transition-all ${
                  !rule.enabled ? "opacity-60" : ""
                } ${
                  isDark
                    ? "bg-slate-900/60 border-slate-700/60 text-slate-100"
                    : "bg-white/40 border-slate-200/50 text-slate-800"
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded text-xs font-bold bg-slate-500/20">
                      Pri: {rule.priority}
                    </span>
                    <span className="px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-blue-500/15 text-blue-500">
                      {rule.type}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                      ["spam", "malicious", "smishing"].includes(rule.action)
                        ? "bg-red-500/15 text-red-500"
                        : "bg-green-500/15 text-green-500"
                    }`}>
                      Action: {rule.action}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleRule(rule)}
                      className={`text-xs font-bold px-2.5 py-1 rounded-md transition-colors ${
                        rule.enabled 
                          ? 'bg-yellow-500/20 text-yellow-600 hover:bg-yellow-500/30' 
                          : 'bg-green-500/20 text-green-600 hover:bg-green-500/30'
                      }`}
                    >
                      {rule.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      onClick={() => handleDeleteRule(rule._id)}
                      className="text-red-500 hover:text-red-600 text-xs font-bold px-2.5 py-1 rounded-md bg-red-500/10 hover:bg-red-500/20 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                
                <div className="font-mono text-sm break-all font-bold p-2 rounded bg-slate-500/10 mb-2">
                  {rule.pattern}
                </div>
                
                {rule.description && (
                  <p className="text-xs opacity-80 mb-1">{rule.description}</p>
                )}
                <div className="text-[10px] opacity-50 flex justify-between">
                  <span>By: {rule.createdBy?.username || 'Unknown'}</span>
                  <span>{new Date(rule.createdAt).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
