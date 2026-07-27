import { useState } from "react";
import { useTheme } from "../context/ThemeContext";
import api from "../utils/axiosInstance";

export default function BulkSpamDetection() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const { isDark, activeTheme } = useTheme();

  const handleFileUpload = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    setError("");
    setResult(null);

    // Validate file type
    const name = selectedFile.name.toLowerCase();
    if (!name.endsWith(".csv") && !name.endsWith(".txt")) {
      setError("Unsupported file type. Only CSV and TXT files are supported.");
      setFile(null);
      return;
    }

    // Validate file size (2MB limit)
    if (selectedFile.size > 2 * 1024 * 1024) {
      setError("File size exceeds the limit of 2MB.");
      setFile(null);
      return;
    }

    setFile(selectedFile);
  };

  const handleSubmit = async () => {
    if (!file) {
      setError("Please select a file to upload.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await api.post(
        "/bulk-predict",
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );
      setResult(res.data);
    } catch (err) {
      console.error(err);
      setError(
        err.response?.data?.error ||
        "An error occurred during bulk spam detection."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadReport = async () => {
    if (!file) return;

    setError("");
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await api.post(
        "/bulk-predict/export",
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
          responseType: "blob",
        }
      );

      // Create blob download link
      const blob = new Blob([res.data], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `bulk_spam_predictions_${Date.now()}.csv`
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setError("Failed to download CSV report.");
    }
  };

  const handleReset = () => {
    setFile(null);
    setResult(null);
    setError("");
  };

  const getBadgeClass = (pred) => {
    const p = pred.toLowerCase();
    if (p === "ham" || p === "safe") {
      return "bg-green-100 text-green-850 dark:bg-green-950/40 dark:text-green-300 border border-green-500/20";
    }
    if (p === "spam" || p === "malicious" || p === "smishing" || p === "offensive") {
      return "bg-red-100 text-red-850 dark:bg-red-950/40 dark:text-red-355 border border-red-500/20";
    }
    return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-700/20";
  };

  return (
    <div className="flex flex-col gap-5 text-left mt-2">
      <div>
        <p className="font-semibold text-xs opacity-75 text-center mb-4 leading-relaxed">
          Upload a CSV or TXT file to classify multiple messages in bulk.
        </p>

        {/* Upload Area */}
        <div className="flex flex-col items-center justify-center mb-4">
          <label
            className={`w-full flex flex-col items-center justify-center px-4 py-5 border-2 border-dashed rounded-2xl cursor-pointer transition-all ${
              isDark
                ? "border-slate-700 hover:border-slate-600 bg-slate-900/30"
                : "border-slate-350 hover:border-slate-400 bg-slate-50/30"
            }`}
          >
            <div className="flex flex-col items-center justify-center pt-1 pb-1">
              <span className="text-2xl mb-2">📁</span>
              <p className="text-xs font-bold mb-0.5">
                {file ? file.name : "Select CSV or TXT file"}
              </p>
              <p className="text-[10px] opacity-60">
                {file ? `${(file.size / 1024).toFixed(1)} KB` : "Supports CSV (text/message column) or TXT (line-by-line) up to 2MB"}
              </p>
            </div>
            <input
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={handleFileUpload}
            />
          </label>
        </div>

        {error && (
          <div className="p-3 mb-4 text-xs font-semibold rounded-xl bg-red-500/10 border border-red-500/35 text-red-500">
            ⚠️ {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={loading || !file}
            className={`flex-1 py-3.5 rounded-xl font-bold text-white shadow-md active:scale-95 transition-all ${
              loading || !file ? "opacity-50 cursor-not-allowed" : ""
            } ${activeTheme.accent}`}
          >
            {loading ? "Analyzing File..." : "Analyze File"}
          </button>
          
          <button
            onClick={handleReset}
            disabled={loading}
            className={`px-5 py-3.5 rounded-xl font-bold shadow-sm transition-all ${
              isDark ? activeTheme.btnSecondaryDark : activeTheme.btnSecondary
            }`}
          >
            Reset
          </button>
        </div>
      </div>

      {/* Result Display */}
      {result && (
        <div className="mt-3 border border-slate-350/20 rounded-2xl p-4 bg-slate-500/5 transition-all duration-300">
          <h3 className="text-xs font-bold uppercase tracking-wider mb-3 opacity-70">Detection Statistics</h3>
          <div className="grid grid-cols-2 gap-3 text-xs mb-4">
            <div className={`p-2.5 rounded-xl border ${isDark ? "bg-slate-900/30 border-slate-800" : "bg-white/40 border-slate-200"}`}>
              <span className="text-[10px] font-bold block opacity-60 mb-0.5">Total Messages</span>
              <span className="text-lg font-extrabold block">{result.total_messages}</span>
            </div>
            <div className={`p-2.5 rounded-xl border ${isDark ? "bg-slate-900/30 border-slate-800" : "bg-white/40 border-slate-200"}`}>
              <span className="text-[10px] font-bold block opacity-60 mb-0.5">Spam Percentage</span>
              <span className="text-lg font-extrabold block text-red-650 dark:text-red-400">{result.spam_percentage}%</span>
            </div>
            <div className={`p-2.5 rounded-xl border ${isDark ? "bg-slate-900/30 border-slate-800" : "bg-white/40 border-slate-200"}`}>
              <span className="text-[10px] font-bold block opacity-60 mb-0.5">Spam Messages</span>
              <span className="text-lg font-extrabold block text-red-600 dark:text-red-400">{result.spam_count}</span>
            </div>
            <div className={`p-2.5 rounded-xl border ${isDark ? "bg-slate-900/30 border-slate-800" : "bg-white/40 border-slate-200"}`}>
              <span className="text-[10px] font-bold block opacity-60 mb-0.5">Legitimate (Ham)</span>
              <span className="text-lg font-extrabold block text-green-600 dark:text-green-400">{result.non_spam_count}</span>
            </div>
          </div>

          <button
            onClick={handleDownloadReport}
            className={`w-full mb-4 py-3 rounded-xl font-bold text-white shadow-md active:scale-95 transition-all ${activeTheme.accent}`}
          >
            📥 Download CSV Report
          </button>

          {/* Results Table */}
          <h3 className="text-xs font-bold uppercase tracking-wider mb-2 opacity-70">Detailed Predictions</h3>
          <div className={`border rounded-xl overflow-hidden ${isDark ? "border-slate-800" : "border-slate-200"}`}>
            <div className="max-h-60 overflow-y-auto">
              <table className="w-full text-[11px] text-left border-collapse">
                <thead>
                  <tr className={`border-b ${isDark ? "bg-slate-900/50 border-slate-800 text-slate-400" : "bg-slate-50 border-slate-200 text-slate-600"}`}>
                    <th className="p-2.5 font-bold">Message</th>
                    <th className="p-2.5 font-bold w-24">Prediction</th>
                  </tr>
                </thead>
                <tbody>
                  {result.results.map((item, idx) => (
                    <tr
                      key={idx}
                      className={`border-b last:border-b-0 ${
                        isDark ? "border-slate-850 hover:bg-slate-900/20" : "border-slate-150 hover:bg-slate-50/50"
                      }`}
                    >
                      <td className="p-2.5 break-all max-w-[200px]" title={item.message}>
                        {item.message}
                      </td>
                      <td className="p-2.5">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold inline-block ${getBadgeClass(item.prediction)}`}>
                          {item.prediction.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
