import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import api from "../utils/axiosInstance";
import "../App.css";
import FeatureImportance from "../components/FeatureImportance";
import WordCloud from '../components/WordCloud';
import FeedbackWidget from "../components/FeedbackWidget";
import FeedbackAnalytics from "../components/FeedbackAnalytics";
import Login from "./Login.jsx";
import Register from "./Register.jsx";
import EmailHeaderAnalyzer from "../components/EmailHeaderAnalyzer";

function SpamDetector() {
  const [text, setText] = useState("");
  const [result, setResult] = useState("");
  const [confidence, setConfidence] = useState(null);
  const [severity, setSeverity] = useState(null);
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState("message");
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState("detector"); // "detector" or "authenticity"
  const { user, logout } = useAuth();

  const {
    themeMode,
    setThemeMode,
    colorTheme,
    setColorTheme,
    isDark,
    activeTheme,
    THEME_PALETTES,
  } = useTheme();

  const handlePredict = async () => {
    if (!text) return;
    try {
      setLoading(true);
      const res = await api.post(
        `${import.meta.env.VITE_API_URI}/predict`, {
        text: text,
        type: type,
      });
      setResult(res.data.prediction);
      setConfidence(res.data.confidence ?? null);
      setSeverity(res.data.severity ?? null);
    } catch (error) {
      setResult("Error");
    } finally {
      setLoading(false);
    }
  };

  const getColor = () => {
    if (result === "ham" || result === "safe") return "text-green-600 dark:text-green-400";
    if (result === "spam" || result === "malicious") return "text-red-600 dark:text-red-400";
    if (result === "smishing") return "text-orange-600 dark:text-orange-400";
    if (result === "Error") {
      return isDark ? "text-yellow-300" : "text-yellow-700";
    }
    return isDark ? "text-slate-300" : "text-slate-600";
  };

  const getBg = () => {
    if (result === "ham" || result === "safe") return "bg-green-500/15 border border-green-500/35";
    if (result === "spam" || result === "malicious") return "bg-red-500/15 border border-red-500/35";
    if (result === "smishing") return "bg-orange-500/15 border border-orange-500/35";
    return "bg-slate-500/15 border border-slate-500/35";
  };

  const confidencePct = confidence !== null ? Math.min(confidence * 50 + 50, 100).toFixed(1) : "0.0";

  return (
    <div className={`min-h-screen flex items-center justify-center px-4 transition-all duration-500 ${
      isDark ? activeTheme.dark : activeTheme.light
    }`}>
      {/* Top Controls */}
      <div className="absolute top-4 right-4 flex gap-3 flex-wrap justify-end">
        <button
          onClick={() => setShowSettings(!showSettings)}
          className={`px-4 py-2.5 rounded-xl font-bold transition-all active:scale-95 flex items-center gap-2 shadow-md ${
            isDark ? "bg-slate-800 text-white hover:bg-slate-700" : "bg-white/35 text-slate-850 hover:bg-white/50"
          }`}
        >
          ⚙️ Customize Theme
        </button>

        <button
          onClick={logout}
          className="px-4 py-2.5 rounded-xl font-bold bg-red-650 hover:bg-red-600 text-white transition-all active:scale-95 shadow-md"
        >
          Logout
        </button>
      </div>

      <div className="absolute top-4 left-4">
        <span className={`text-sm font-semibold px-4 py-2 rounded-full shadow-sm backdrop-blur-md ${
          isDark ? "bg-slate-800/80 text-slate-200 border border-slate-700/50" : "bg-white/30 text-slate-850 border border-white/20"
        }`}>
          👤 {user?.username}
        </span>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={`w-full max-w-md rounded-3xl p-6 shadow-2xl border transition-all duration-300 ${
            isDark ? "bg-slate-900 text-slate-100 border-slate-700" : "bg-white text-slate-900 border-slate-200"
          }`}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">🎨 Theme Settings</h3>
              <button
                onClick={() => setShowSettings(false)}
                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                  isDark ? "bg-slate-800 hover:bg-slate-700" : "bg-slate-100 hover:bg-slate-200"
                }`}
              >
                ✕
              </button>
            </div>

            {/* Mode selection */}
            <div className="mb-6">
              <label className="block text-sm font-semibold mb-3">Theme Mode</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { mode: "light", label: "☀️ Light" },
                  { mode: "dark", label: "🌙 Dark" },
                  { mode: "system", label: "⚙️ System" },
                ].map((item) => (
                  <button
                    key={item.mode}
                    onClick={() => setThemeMode(item.mode)}
                    className={`py-2 px-3 rounded-xl text-sm font-medium transition-all ${
                      themeMode === item.mode
                        ? activeTheme.accent
                        : isDark
                        ? "bg-slate-800 hover:bg-slate-750 text-slate-300"
                        : "bg-slate-100 hover:bg-slate-150 text-slate-700"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Color selection */}
            <div>
              <label className="block text-sm font-semibold mb-3">Color Accent</label>
              <div className="flex flex-col gap-2">
                {Object.entries(THEME_PALETTES).map(([key, value]) => (
                  <button
                    key={key}
                    onClick={() => setColorTheme(key)}
                    className={`w-full flex items-center justify-between p-3.5 rounded-xl text-left text-sm font-semibold border transition-all ${
                      colorTheme === key
                        ? isDark
                          ? "border-blue-500 bg-slate-800"
                          : "border-indigo-500 bg-slate-100"
                        : isDark
                        ? "border-slate-800 bg-slate-850 hover:bg-slate-800"
                        : "border-slate-100 bg-slate-50 hover:bg-slate-100"
                    }`}
                  >
                    <span>{value.name}</span>
                    <span className={`w-8 h-5 rounded-full ${value.light}`} />
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => setShowSettings(false)}
              className={`w-full mt-6 py-3 rounded-xl font-bold text-white shadow-md transition-all active:scale-95 ${activeTheme.accent}`}
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Main card */}
      <div className={`w-full max-w-lg backdrop-blur-xl border rounded-3xl shadow-2xl p-6 sm:p-8 text-center transition-all duration-500 ${
        isDark ? "bg-slate-950/40 border-slate-750" : "bg-white/20 border-white/20"
      }`}>
        <div className={`w-full max-w-md rounded-2xl shadow-3xl p-6 sm:p-8 text-center mx-auto transition-all duration-500 ${
          isDark ? activeTheme.cardDark : `${activeTheme.card} backdrop-blur-md`
        }`}>
          <h1 className="text-3xl font-extrabold mb-2 tracking-tight">📨 Spam Detector</h1>

          <p className="font-semibold text-sm mb-6 opacity-75">
            Analyze messages, emails & URLs instantly
          </p>

          {/* Navigation Tabs */}
          <div className="flex justify-center gap-2 mb-6 border-b border-slate-500/20 pb-3 text-sm font-bold">
            <button
              onClick={() => setActiveTab("detector")}
              className={`pb-1 px-4 transition-all border-b-2 ${
                activeTab === "detector"
                  ? "border-current opacity-100"
                  : "border-transparent opacity-50 hover:opacity-75"
              }`}
            >
              Spam Detector
            </button>
            <button
              onClick={() => setActiveTab("authenticity")}
              className={`pb-1 px-4 transition-all border-b-2 ${
                activeTab === "authenticity"
                  ? "border-current opacity-100"
                  : "border-transparent opacity-50 hover:opacity-75"
              }`}
            >
              Sender Verifier
            </button>
            <button
              onClick={() => setActiveTab("analytics")}
              className={`pb-1 px-4 transition-all border-b-2 ${
                activeTab === "analytics"
                  ? "border-current opacity-100"
                  : "border-transparent opacity-50 hover:opacity-75"
              }`}
            >
              Feedback Analytics
            </button>
          </div>

          {activeTab === "detector" && (
            <>
              <div className="mb-4">
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className={`w-full p-3.5 rounded-xl border font-semibold focus:outline-none focus:ring-2 transition-all ${
                    isDark ? activeTheme.inputDark : activeTheme.input
                  }`}
                >
                  <option value="message">Message</option>
                  <option value="email">Email</option>
                  <option value="url">URL</option>
                </select>
              </div>

              <textarea
                className={`w-full border p-3.5 rounded-xl focus:outline-none focus:ring-2 resize-none text-sm sm:text-base transition-all ${
                  isDark ? activeTheme.inputDark : activeTheme.input
                }`}
                rows="4"
                placeholder={
                  type === "url"
                    ? "Enter URL to check..."
                    : type === "message"
                    ? "Type your message..."
                    : "Paste your email content..."
                }
                value={text}
                onChange={(e) => setText(e.target.value)}
              />

              <button
                onClick={handlePredict}
                className={`mt-5 w-full py-3.5 rounded-xl font-bold text-white shadow-md active:scale-95 transition-all ${activeTheme.accent}`}
              >
                {loading ? "Analyzing..." : `Analyze ${type === "url" ? "URL" : type}`}
              </button>

              {result && (
                <div className="mt-4 border border-slate-350/20 rounded-2xl p-2 bg-slate-500/5">
                  <div className={`p-4 rounded-xl font-bold transition-all duration-300 ${getBg()} ${getColor()}`}>
                    {result === "ham" && "✅ Safe Message"}
                    {result === "spam" && "🚫 Spam Detected"}
                    {result === "smishing" && "⚠️ Fraud Alert"}
                    {result === "safe" && "✅ Safe URL"}
                    {result === "malicious" && "🚨 Malicious URL"}
                    {result === "Error" && "⚠️ Something went wrong"}
                  </div>
                </div>
              )}
              <WordCloud darkMode={darkMode} />

              {result && confidence !== null && result !== "Error" && (
                <div className="mt-4 text-left">
                  <p className="text-xs font-semibold mb-1 opacity-70">
                    Model Confidence: {confidencePct}%
                  </p>
                  <div className={`w-full rounded-full h-2 ${isDark ? "bg-slate-800" : "bg-slate-200"}`}>
                    <div
                      className={`h-2 rounded-full transition-all duration-500 ${
                        result === "ham" || result === "safe"
                          ? "bg-green-500"
                          : result === "spam" || result === "malicious"
                          ? "bg-red-500"
                          : "bg-orange-500"
                      }`}
                      style={{ width: `${confidencePct}%` }}
                    />
                  </div>
                </div>
              )}

              {result && severity && result !== "Error" && (
                <div className="mt-4 text-left rounded-2xl border border-slate-500/20 p-4 bg-slate-500/5">
                  <p className="text-xs font-semibold mb-2 opacity-70">Severity</p>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-sm font-bold ${
                      severity.color === "red"
                        ? "text-red-600 dark:text-red-400"
                        : severity.color === "orange"
                        ? "text-orange-600 dark:text-orange-400"
                        : severity.color === "yellow"
                        ? "text-yellow-600 dark:text-yellow-400"
                        : "text-green-600 dark:text-green-400"
                    }`}>
                      {severity.level}
                    </span>
                    <span className="text-sm font-semibold">{severity.score} / 10</span>
                  </div>
                  <div className="space-y-1 text-sm">
                    {severity.indicators.map((indicator) => (
                      <div key={indicator} className="flex items-center gap-2">
                        <span>✓</span>
                        <span>{indicator}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result && result !== "Error" && type !== "url" && (
                <FeedbackWidget
                  key={`${text}|${result}|${confidence}`}
                  text={text}
                  predictedLabel={result}
                  darkMode={isDark}
                />
              )}

              <button
                onClick={() => {
                  setText("");
                  setResult("");
                  setConfidence(null);
                  setSeverity(null);
                  setType("message");
                }}
                className={`mt-4 w-full py-3.5 rounded-xl font-bold shadow-sm transition-all ${
                  isDark ? activeTheme.btnSecondaryDark : activeTheme.btnSecondary
                }`}
              >
                Reset
              </button>

              <FeatureImportance darkMode={isDark} />
            </>
          )}
          {activeTab === "authenticity" && <EmailHeaderAnalyzer />}
          {activeTab === "analytics" && <FeedbackAnalytics darkMode={isDark} />}
        </div>
      </div>
    </div>
  );
}

export default SpamDetector;