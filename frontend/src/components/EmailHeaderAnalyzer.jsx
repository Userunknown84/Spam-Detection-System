import { useState } from "react";
import { useTheme } from "../context/ThemeContext";
import api from "../utils/axiosInstance";

export default function EmailHeaderAnalyzer() {
  const [headers, setHeaders] = useState("");
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const { isDark, activeTheme } = useTheme();

  const handleFileUpload = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;
    
    setError("");
    setFile(selectedFile);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      // Extract everything before the first double newline (headers)
      const doubleNewlineIndex = text.search(/\r?\n\r?\n/);
      let headersText = text;
      if (doubleNewlineIndex !== -1) {
        headersText = text.substring(0, doubleNewlineIndex);
      }
      setHeaders(headersText.trim());
    };
    reader.onerror = () => {
      setError("Failed to read EML file.");
    };
    reader.readAsText(selectedFile);
  };

  const handleAnalyze = async () => {
    if (!headers.trim() && !file) {
      setError("Please paste email headers or upload a .eml file.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      let res;
      if (file) {
        const formData = new FormData();
        formData.append("file", file);
        res = await api.post(
          "/analyze-email-header",
          formData,
          {
            headers: {
              "Content-Type": "multipart/form-data",
            },
          }
        );
      } else {
        res = await api.post(
          "/analyze-email-header",
          { headers: headers }
        );
      }
      setResult(res.data);
    } catch (err) {
      console.error(err);
      setError(
        err.response?.data?.error ||
        "An error occurred while analyzing the email headers."
      );
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    if (status === "Trusted") return "text-green-600 dark:text-green-400";
    if (status === "High Risk") return "text-red-650 dark:text-red-400";
    return "text-orange-600 dark:text-orange-400";
  };

  const getStatusBg = (status) => {
    if (status === "Trusted") return "bg-green-500/15 border border-green-500/35";
    if (status === "High Risk") return "bg-red-500/15 border border-red-500/35";
    return "bg-orange-500/15 border border-orange-500/35";
  };

  const getBadgeClass = (status) => {
    const s = status.toLowerCase();
    if (s === "pass" || s === "ok" || s === "success") {
      return "bg-green-100 text-green-850 dark:bg-green-950/40 dark:text-green-300 border border-green-500/20";
    }
    if (s === "fail" || s === "failed") {
      return "bg-red-100 text-red-850 dark:bg-red-950/40 dark:text-red-350 border border-red-500/20";
    }
    return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-700/20";
  };

  return (
    <div className="flex flex-col gap-5 text-left mt-2">
      <div>
        <p className="font-semibold text-xs opacity-75 text-center mb-4 leading-relaxed">
          Upload a .eml file or paste raw headers to verify sender authenticity
        </p>

        {/* EML Upload Area */}
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
              <p className="text-xs font-bold mb-0.5">Upload .eml file</p>
              <p className="text-[10px] opacity-60">or drag and drop here</p>
            </div>
            <input
              type="file"
              accept=".eml"
              className="hidden"
              onChange={handleFileUpload}
            />
          </label>
        </div>

        {/* OR Divider */}
        <div className="flex items-center my-3 opacity-40">
          <hr className="flex-grow border-current" />
          <span className="px-3 text-[10px] font-bold uppercase tracking-wider">OR</span>
          <hr className="flex-grow border-current" />
        </div>

        {/* Text Area */}
        <div className="mb-4">
          <textarea
            className={`w-full border p-3 rounded-xl focus:outline-none focus:ring-2 resize-none text-xs font-mono transition-all ${
              isDark ? activeTheme.inputDark : activeTheme.input
            }`}
            rows="5"
            placeholder="Paste raw email headers here..."
            value={headers}
            onChange={(e) => {
              setHeaders(e.target.value);
              setFile(null);
            }}
          />
        </div>

        {error && (
          <div className="p-3 mb-4 text-xs font-semibold rounded-xl bg-red-500/10 border border-red-500/35 text-red-500">
            ⚠️ {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleAnalyze}
            disabled={loading}
            className={`flex-1 py-3.5 rounded-xl font-bold text-white shadow-md active:scale-95 transition-all ${activeTheme.accent}`}
          >
            {loading ? "Analyzing Headers..." : "Analyze Headers"}
          </button>
          
          <button
            onClick={() => {
              setHeaders("");
              setFile(null);
              setResult(null);
              setError("");
            }}
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
          {/* Security Result Card */}
          <div className={`p-4 rounded-xl font-bold text-center border mb-4 ${getStatusBg(result.trust_level || result.status)} ${getStatusColor(result.trust_level || result.status)}`}>
            <div className="text-lg mb-1 flex items-center justify-center gap-1.5">
              {(result.trust_level || result.status) === "Trusted" && <span>🛡️ Trust Level: Trusted</span>}
              {(result.trust_level || result.status) === "High Risk" && <span>🚨 Trust Level: High Risk</span>}
              {(result.trust_level || result.status) === "Suspicious" && <span>⚠️ Trust Level: Suspicious</span>}
            </div>
            {result.risk_score !== undefined && (
              <p className="text-sm font-extrabold mt-1">
                Risk Score: {result.risk_score}/100
              </p>
            )}
            <p className="text-[11px] font-semibold opacity-90 mt-2 leading-relaxed">
              {(result.trust_level || result.status) === "Trusted" && "The sender domain successfully authenticated and aligned."}
              {(result.trust_level || result.status) === "High Risk" && "Critical authentication failures or sender domain spoofing detected."}
              {(result.trust_level || result.status) === "Suspicious" && "Authentication records are incomplete or domain alignment is missing."}
            </p>
          </div>

          <div className="flex flex-col gap-3">
            {/* Findings List */}
            {result.findings && (
              <div className={`p-3 rounded-xl border text-left text-xs ${isDark ? "bg-slate-900/30 border-slate-800" : "bg-white/40 border-slate-200"}`}>
                <span className="text-[10px] font-bold block opacity-60 mb-2 uppercase tracking-wider">Findings</span>
                {result.findings.length > 0 ? (
                  <ul className="space-y-1 font-semibold">
                    {result.findings.map((finding, idx) => (
                      <li key={idx} className="flex items-start gap-1.5 text-red-650 dark:text-red-350">
                        <span className="font-extrabold text-red-650 dark:text-red-400">✓</span>
                        <span>{finding}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-green-600 dark:text-green-400 font-bold flex items-center gap-1.5">
                    <span>✓</span> All authentication checks passed successfully. No anomalies detected.
                  </p>
                )}
              </div>
            )}
            {/* Details Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className={`p-2.5 rounded-xl border ${isDark ? "bg-slate-900/30 border-slate-800" : "bg-white/40 border-slate-200"}`}>
                <span className="text-[10px] font-bold block opacity-60 mb-0.5">Sender Address</span>
                <span className="font-semibold truncate block" title={result.analysis.sender}>
                  {result.analysis.sender}
                </span>
              </div>
              <div className={`p-2.5 rounded-xl border ${isDark ? "bg-slate-900/30 border-slate-800" : "bg-white/40 border-slate-200"}`}>
                <span className="text-[10px] font-bold block opacity-60 mb-0.5">DMARC Status</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold inline-block ${getBadgeClass(result.analysis.dmarc)}`}>
                  {result.analysis.dmarc.toUpperCase()}
                </span>
              </div>
              <div className={`p-2.5 rounded-xl border ${isDark ? "bg-slate-900/30 border-slate-800" : "bg-white/40 border-slate-200"}`}>
                <span className="text-[10px] font-bold block opacity-60 mb-0.5">SPF Status</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold inline-block ${getBadgeClass(result.analysis.spf)}`}>
                  {result.analysis.spf.toUpperCase()}
                </span>
              </div>
              <div className={`p-2.5 rounded-xl border ${isDark ? "bg-slate-900/30 border-slate-800" : "bg-white/40 border-slate-200"}`}>
                <span className="text-[10px] font-bold block opacity-60 mb-0.5">DKIM Status</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold inline-block ${getBadgeClass(result.analysis.dkim)}`}>
                  {result.analysis.dkim.toUpperCase()}
                </span>
              </div>
            </div>

            {/* Alignments */}
            <div className="flex flex-col gap-1.5 mt-1 text-xs">
              <div className="flex justify-between items-center font-bold">
                <span className="opacity-75">Return-Path Alignment</span>
                <span>
                  {result.analysis.return_path_match ? (
                    <span className="text-green-600 dark:text-green-400">✅ Match</span>
                  ) : (
                    <span className="text-red-650 dark:text-red-400">❌ Mismatch</span>
                  )}
                </span>
              </div>
              <div className="flex justify-between items-center font-bold">
                <span className="opacity-75">Sender Domain Alignment</span>
                <span>
                  {result.analysis.sender_domain_match ? (
                    <span className="text-green-600 dark:text-green-400">✅ Match</span>
                  ) : (
                    <span className="text-red-650 dark:text-red-400">❌ Mismatch</span>
                  )}
                </span>
              </div>
            </div>

            {/* Reasons / Warnings List */}
            {result.analysis.reasons && result.analysis.reasons.length > 0 && (
              <div className="mt-1 border-t border-slate-500/20 pt-2 text-[11px]">
                <p className="font-bold mb-1 opacity-70 uppercase tracking-wider text-[10px]">Analysis Details:</p>
                <ul className="list-disc pl-4 space-y-0.5 opacity-90 font-semibold">
                  {result.analysis.reasons.map((reason, index) => (
                    <li key={index} className="leading-normal text-red-600 dark:text-red-300">
                      {reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
