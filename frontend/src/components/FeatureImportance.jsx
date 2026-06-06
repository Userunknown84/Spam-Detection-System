import { useState, useEffect } from "react";

export default function FeatureImportance({ darkMode }) {
  const [features, setFeatures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch("http://127.0.0.1:5000/importance")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to fetch");
        return r.json();
      })
      .then((data) => {
        setFeatures(data.top_features || []);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  const max = features.length > 0
    ? Math.max(...features.map((f) => Math.abs(f.importance)))
    : 1;

  return (
    <div className={`mt-6 p-4 rounded-xl border ${
      darkMode ? "bg-gray-800/70 border-gray-600 text-white" : "bg-white/40 border-white/30 text-black"
    }`}>
      <h2 className="text-lg font-bold mb-3">
        📊 Top Spam Indicators
      </h2>

      {loading && (
        <p className="text-sm text-gray-400 animate-pulse">Loading feature importance...</p>
      )}

      {error && (
        <p className="text-sm text-red-400">⚠️ Could not load data: {error}</p>
      )}

      {!loading && !error && features.length === 0 && (
        <p className="text-sm text-gray-400">No feature data available.</p>
      )}

      {!loading && !error && features.map((f, i) => (
        <div key={i} className="mb-2">
          <div className="flex justify-between text-xs mb-1">
            <span className="font-mono font-semibold">{f.feature}</span>
            <span className="text-gray-400">{f.importance.toFixed(4)}</span>
          </div>
          <div className={`w-full rounded-full h-3 ${darkMode ? "bg-gray-700" : "bg-gray-200"}`}>
            <div
              className="h-3 rounded-full bg-indigo-500 transition-all duration-500"
              style={{ width: `${(Math.abs(f.importance) / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}