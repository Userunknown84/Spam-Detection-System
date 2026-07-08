import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import api from "../utils/axiosInstance";
import "../App.css";
import CensorshipMode from '../components/CensorshipMode';
import FeatureImportance from "../components/FeatureImportance";
import PredictionExplanation from "../components/PredictionExplanation";
import History from "../components/History";
import WordCloud from "../components/WordCloud";
import ManipulationIndex from '../components/ManipulationIndex';
import FeedbackWidget from "../components/FeedbackWidget";
import Login from "./Login.jsx";
import DeSpamify from '../components/DeSpamify';
import confetti from 'canvas-confetti';
import Register from "./Register.jsx";
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import EmailHeaderAnalyzer from "../components/EmailHeaderAnalyzer";
import BulkSpamDetection from "../components/BulkSpamDetection";
import SpamInsightsDashboard from "../components/SpamInsightsDashboard";
import EmailScannerDashboard from "../components/EmailScannerDashboard";
import Chatbot from "../components/Chatbot";
import Footer from "../components/Footer";
import SpamPatternLibrary from '../components/SpamPatternLibrary';
import URLPreview from '../components/URLPreview';
import InstallAppButton from "../components/InstallAppButton";
import RulesManager from "../components/RulesManager";

function App() {
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [result, setResult] = useState("");
  const [confidence, setConfidence] = useState(null);
  const [explanation, setExplanation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState("message");
  const [errorInfo, setErrorInfo] = useState(null);
  const [wordOfDay, setWordOfDay] = useState(null);
  const [showDeSpamify,setShowDeSpamify]= useState(false);
  const [wordLoading, setWordLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showPatternLibrary, setShowPatternLibrary] = useState(false);
  const [hasCelebrated, setHasCelebrated] = useState(() => {
    return localStorage.getItem("firstPrediction") === "true";
  });
  const [showCelebration, setShowCelebration] = useState(false);

  const [darkMode, setDarkMode] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [theme, setTheme] = useState("ocean");
  const [showThemes, setShowThemes] = useState(false);

  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("provider") && params.get("code")) {
      return "scanner";
    }
    return "detector";
  });

  const [soundEnabled, setSoundEnabled] = useState(true);

  // Detect URLs in text
  const detectURLs = (text) => {
    if (!text) return [];
    const urlRegex = /(https?:\/\/[^\s]+)/g;
     const matches = text.match(urlRegex);
      return matches || [];
    };

  const playSpamSound = () => {
    if (!soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.15].forEach((delay) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 600;
        osc.type = "square";
        gain.gain.setValueAtTime(0.3, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + delay + 0.15);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 0.15);
      });
    } catch (e) {
      /* silent fail */
    }
  };

  // Helper to get earned badges (returns array of badge objects)
  const getEarnedBadges = () => {
    try {
      const streakCount = parseInt(localStorage.getItem('predictionStreak') || '0', 10);
      return Object.keys(Badges)
        .map((k) => ({ day: Number(k), ...Badges[k] }))
        .filter((b) => streakCount >= b.day);
    } catch (e) {
      return [];
    }
  };

  // Placeholder for badge checking logic
  const checkNewBadge = (newStreak) => {
    // simple implementation: if new streak matches a badge threshold, show popup
    if (Badges[newStreak]) {
      setNewBadgeEarned(true);
      setShowBadgePopup(true);
      setTimeout(() => setShowBadgePopup(false), 4000);
    }
  };

  //Streak tracking
  const [streak, setStreak] = useState(() => {
    const lastDate = localStorage.getItem("lastPredictionDate");
    const streakCount = parseInt(localStorage.getItem("streakCount") || "0", 10);
    const today = new Date().toDateString();

    if (lastDate === today) return streakCount;
    if(lastDate){
      const last = new Date(lastDate);
      const now = new Date();
      const diffTime = now - last;
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
      if (diffDays === 1) return streakCount + 1;
      if (diffDays > 1) return 0;
    }
    return streakCount;
  });

  const [newBadgeEarned, setNewBadgeEarned] = useState(false);
  const [showBadgePopup, setShowBadgePopup] = useState(false);

  //Badge Definitions
  const Badges = {
     3: { name: '🔥 Novice Streaker', icon: '🔥', color: 'bg-orange-500', description: '3 day streak' },
     7: { name: '⚡ Weekly Warrior', icon: '⚡', color: 'bg-blue-500', description: '7 day streak' },
     14: { name: '🌟 Fortnight Champion', icon: '🌟', color: 'bg-purple-500', description: '14 day streak' },
     30: { name: '🏆 Monthly Master', icon: '🏆', color: 'bg-yellow-500', description: '30 day streak' },
     50: { name: '💎 Diamond Streaker', icon: '💎', color: 'bg-cyan-500', description: '50 day streak' },
     100: { name: '👑 Legendary Streaker', icon: '👑', color: 'bg-red-500', description: '100 day streak' },
    };

  const playHamSound = () => {
    if (!soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [523, 659, 784].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.12 + 0.15);
        osc.start(ctx.currentTime + i * 0.12);
        osc.stop(ctx.currentTime + i * 0.12 + 0.15);
      });
    } catch (e) { /* silent fail */ }
  };

  const { user, login, logout } = useAuth();
  const handleLogout = () => {
    logout();
    localStorage.removeItem("user");
    navigate("/");
  };

  const {
    themeMode,
    setThemeMode,
    colorTheme,
    setColorTheme,
    isDark,
    activeTheme,
    THEME_PALETTES,
  } = useTheme();

  const detectType = (text) => {
    if (!text || text.trim().length === 0) return "message";
    const trimmed = text.trim();
    if (trimmed.includes("http://") || trimmed.includes("https://")) return "url";
    if (trimmed.includes("@") && trimmed.includes(".")) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (emailRegex.test(trimmed)) return "email";
    }
    if (trimmed.length < 160 && !trimmed.includes("\n")) return "sms";
    return "message";
  };

  const calculateReadingTime = (text) => {
    if (!text || text.trim().length === 0) return '0 sec read';
    const wordCount = text.trim().split(/\s+/).length;
    const readingTimeMinutes = wordCount / 200;
    if (readingTimeMinutes < 1) {
      const seconds = Math.round(readingTimeMinutes * 60);
      return `${seconds} sec read`;
    } else if (readingTimeMinutes < 2) {
      return '1 min read';
    } else {
      return `${Math.round(readingTimeMinutes)} min read`;
    }
  };


  const getTextStats = (text) => {
    if(!text || text.trim().length === 0) {
      return { words: 0, chars: 0, avgWordLength: 0, sentences: 0 };
    }
    const words = text.trim().split(/\s+/);
    const chars = text.replace(/\s+/g, '').length;
    const avgWordLength = words.length > 0 ? (chars / words.length).toFixed(1) : 0;
    const sentences = text.trim().split(/[.!?]+/).filter(Boolean).length;
    return{
      words: words.length,
      chars,
      avgWordLength,
      sentences
   };
  };

  const detectPatterns = (text) => {
  const patterns = [];
  if (!text) return patterns;
  
  if (text.includes('!!!') || (text.match(/!/g) || []).length >= 3) {
    patterns.push({ icon: '🔴', label: 'Multiple exclamation marks', severity: 'medium' });
  }
  if (text.match(/http[s]?:\/\/\S+/)) {
    patterns.push({ icon: '🔗', label: 'Suspicious link detected', severity: 'high' });
  }
  if (text.match(/urgent|immediate|act now|asap|hurry/i)) {
    patterns.push({ icon: '⏰', label: 'Urgency detected', severity: 'medium' });
  }
  if (text.match(/free|win|prize|claim|winner|congratulations|bonus|offer/i)) {
    patterns.push({ icon: '🎯', label: 'Incentive bait detected', severity: 'medium' });
  }
  if (text.match(/[A-Z]{5,}/)) {
    patterns.push({ icon: '🔊', label: 'Excessive caps detected', severity: 'low' });
  }
  if (text.match(/[^a-zA-Z0-9\s]/g) && (text.match(/[^a-zA-Z0-9\s]/g) || []).length > 10) {
    patterns.push({ icon: '💀', label: 'Many special characters', severity: 'low' });
  }
  if (text.match(/\b\d{10,}\b/)) {
    patterns.push({ icon: '📱', label: 'Phone number detected', severity: 'medium' });
  }
  if (text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)) {
    patterns.push({ icon: '📧', label: 'Email address detected', severity: 'low' });
  }
  if (text.match(/password|credit card|bank account|ssn|social security/i)) {
    patterns.push({ icon: '🔒', label: 'Sensitive data request', severity: 'high' });
  }
  if (text.match(/click here|visit|subscribe|download|sign up|register/i)) {
    patterns.push({ icon: '👆', label: 'Call to action detected', severity: 'low' });
  }
  
  return patterns;
};

//Emoji Sentiment Analysis
const analyzeEmojiSentiment = (text) => {
  if (!text) return { positive: 0, negative: 0, neutral: 0 };

  const emojiRegex = /([\u2700-\u27BF]|[\uE000-\uF8FF]|[\uD83C-\uDBFF\uDC00-\uDFFF])/g;
  const matches = text.match(emojiRegex) || [];

  if (matches.length === 0) return { positive: 0, negative: 0, neutral: 0 };
  
  // Sentiment mapping
    const sentimentMap = {
    '😊': 'positive', '😃': 'positive', '😄': 'positive', '❤️': 'positive', '🎉': 'positive',
    '👍': 'positive', '✨': 'positive', '🔥': 'positive', '🌟': 'positive', '💯': 'positive',
    '😢': 'negative', '😭': 'negative', '😠': 'negative', '😡': 'negative', '💀': 'negative',
    '😐': 'neutral', '🤔': 'neutral', '🧐': 'neutral', '😑': 'neutral'
  };
  
  const sentiments = matches.map(e => sentimentMap[e] || 'neutral');
  const positive = sentiments.filter(s => s === 'positive').length;
  const negative = sentiments.filter(s => s === 'negative').length;
  
  let overall = 'neutral';
  if (positive > negative) overall = 'positive';
  else if (negative > positive) overall = 'negative';
  
  // Check for spam emojis
  const spamEmojis = ['💸', '💰', '🎁', '🏆', '💎', '🚨', '⚠️', '🎰', '🤑'];
  const spamMatches = matches.filter(e => spamEmojis.includes(e));
  
  return {
    count: matches.length,
    emojis: matches,
    sentiment: overall,
    positive: positive,
    negative: negative,
    neutral: sentiments.filter(s => s === 'neutral').length,
    spamDetected: spamMatches.length > 0,
    spamEmojis: spamMatches
  };
};

  const fetchWordOfTheDay = async () => {
    try {
      setWordLoading(true);
      const res = await api.get('/api/word-of-the-day');
      if (res.data.success) {
        setWordOfDay(res.data.data);
      } else {
        setWordOfDay(null);
      }
    } catch (err) {
      console.error("Error fetching word of the day:", err);
      setWordOfDay(null);
    } finally {
      setWordLoading(false);
    }
  };

  useEffect(() => {
    fetchWordOfTheDay();
  }, []);

  const handlePredict = async () => {
    if (!text || text.trim().length === 0) return;
    try {
      setLoading(true);
      const res = await api.post(`${import.meta.env.VITE_API_URI}/predict`, {
        text: text,
        type: type,
      });
      if (!hasCelebrated) {
        triggerConfetti();
        setHasCelebrated(true);
        localStorage.setItem('firstPrediction', 'true');
      }
      setResult(res.data.prediction);
      setConfidence(res.data.confidence ?? null);
      setExplanation(res.data.explanation || null);
      setErrorInfo(null);
    } catch (error) {
      console.error('API Error:', error);

      let errorTitle = "Something went wrong";
      let errorMessage = "Please try again later.";
      let retryable = true;

      // Check for specific error types
      if (error.response == 'ECONNABORTED') {
        errorTitle = "Request Timeout";
        errorMessage = "The request took too long to complete. Please try again.";
        retryable = true;
      } else if (error.code === 'ERR_NETWORK' || !error.response) {
    errorTitle = "📡 Network Error";
    errorMessage = "Unable to connect to the server. Please check your internet connection.";
    retryable = true;
  } else if (error.response?.status === 401) {
    errorTitle = "🔐 Authentication Required";
    errorMessage = "Your session has expired. Please login again.";
    retryable = false;
  } else if (error.response?.status === 404) {
    errorTitle = "🔧 Service Unavailable";
    errorMessage = "The prediction service is currently unavailable. Please try again later.";
    retryable = true;
  } else if (error.response?.status >= 500) {
    errorTitle = "⚠️ Server Error";
    errorMessage = "Something went wrong on our end. Our team has been notified.";
    retryable = true;
  } else if (error.response?.data?.error) {
    errorMessage = error.response.data.error;
  }
  
  setResult("Error");
  setErrorInfo({
    title: errorTitle,
    message: errorMessage,
    retryable: retryable
  });
  } finally {
      setLoading(false);

      const today = new Date().toDateString();
      const lastDate = localStorage.getItem('lastPredictionDate');
      const currentStreak = parseInt(localStorage.getItem('predictionStreak') || '0');

      if (lastDate !== today) {
      const newStreak = currentStreak + 1;
      localStorage.setItem('predictionStreak', newStreak.toString());
      localStorage.setItem('lastPredictionDate', today);
      setStreak(newStreak);
      checkNewBadge(newStreak);
      }
    }
  };

  if (result === 'spam' || result === 'malicious') {
    playSpamSound();
  } else if (result === 'ham' || result === 'safe') {
    playHamSound();
  }

  const triggerConfetti = () => {
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    setTimeout(() => {
      confetti({ particleCount: 50, spread: 50, origin: { y: 0.6, x: 0.3 } });
    }, 200);
    setTimeout(() => {
      confetti({ particleCount: 50, spread: 50, origin: { y: 0.6, x: 0.7 } });
    }, 400);
    setTimeout(() => {
      setShowCelebration(true);
    }, 500);
  };

  const confidencePct = confidence !== null ? Math.min(confidence * 50 + 50, 100).toFixed(1) : "0.0";
  const confidenceValue = Number(confidencePct);
  const riskLevel = confidenceValue >= 80 ? "High" : confidenceValue >= 50 ? "Medium" : "Low";

  return (
    <div className={`min-h-screen flex flex-col items-center px-4 py-8 pb-32 transition-all duration-500 ${isDark ? activeTheme.dark : activeTheme.light}`}>
      {/* Top Controls */}
      <div className="absolute top-4 right-4 flex gap-3 flex-wrap justify-end">
        <InstallAppButton />
        <button
          onClick={() => setThemeMode(isDark ? 'light' : 'dark')}
          className="px-4 py-2.5 rounded-xl font-bold transition-all active:scale-95 flex items-center gap-2 shadow-md"
          style={{
            background: isDark ? '#fbbf24' : '#1e293b',
            color: isDark ? '#1e293b' : '#fbbf24',
            border: 'none',
            cursor: 'pointer'
          }}
        >
          {isDark ? '☀️' : '🌙'}
        </button>
        <InstallAppButton />
        <button
          onClick={() => setShowSettings(!showSettings)}
          className={`px-4 py-2.5 rounded-xl font-bold transition-all active:scale-95 flex items-center gap-2 shadow-md ${isDark ? "bg-slate-800 text-white hover:bg-slate-700" : "bg-white/35 text-slate-850 hover:bg-white/50"}`}
        >
          ⚙️ Customize Theme
        </button>
        <button
          onClick={handleLogout}
          className="px-4 py-2.5 rounded-xl font-bold bg-red-650 hover:bg-red-600 text-white transition-all active:scale-95 shadow-md"
        >
          Logout
        </button>
      </div>

      <button
        onClick={() => setSoundEnabled(!soundEnabled)}
        className="px-4 py-2.5 rounded-xl font-bold transition-all active:scale-95 flex items-center gap-2 shadow-md"
        style={{
          background: isDark ? '#1e293b' : '#e2e8f0',
          color: isDark ? '#e4e4e4' : '#1e293b',
          border: 'none',
          cursor: 'pointer'
        }}
      >
        {soundEnabled ? '🔊' : '🔇'}
      </button>

      <div className="absolute top-4 left-4 flex items-center gap-3">
        <label className="cursor-pointer relative group">
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="Avatar" className="w-10 h-10 rounded-full border-2 border-slate-300 object-cover shadow-sm" />
          ) : (
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg shadow-sm border ${isDark ? 'bg-slate-800 border-slate-600' : 'bg-white border-slate-300'}`}>👤</div>
          )}
          <div className="absolute inset-0 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-[10px] text-white font-bold uppercase tracking-wider">Edit</span>
          </div>
          <input type="file" className="hidden" accept="image/*" onChange={async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const formData = new FormData();
            formData.append('avatar', file);
            try {
              const token = localStorage.getItem('token');
              const res = await api.post(`${import.meta.env.VITE_API_URI || ''}/api/v1/auth/avatar`, formData, {
                headers: {
                  'Content-Type': 'multipart/form-data',
                  Authorization: `Bearer ${token}`
                }
              });
              localStorage.setItem('user', JSON.stringify(res.data.user));
              login(res.data.user);
              window.location.reload();
            } catch (err) {
              alert('Failed to upload avatar: ' + (err.response?.data?.error || err.message));
            }
          }} />
        </label>
        <span className={`text-sm font-semibold px-4 py-2 rounded-full shadow-sm backdrop-blur-md ${isDark ? "bg-slate-800/80 text-slate-200 border border-slate-700/50" : "bg-white/30 text-slate-850 border border-white/20"}`}>
          {user?.username}
        </span>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={`w-full max-w-md rounded-3xl p-6 shadow-2xl border transition-all duration-300 ${isDark ? "bg-slate-900 text-slate-100 border-slate-700" : "bg-white text-slate-900 border-slate-200"}`}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">🎨 Theme Settings</h3>
              <button
                onClick={() => setShowSettings(false)}
                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${isDark ? "bg-slate-800 hover:bg-slate-700" : "bg-slate-100 hover:bg-slate-200"}`}
              >
                ✕
              </button>
            </div>

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
                    className={`py-2 px-3 rounded-xl text-sm font-medium transition-all ${themeMode === item.mode ? activeTheme.accent : isDark ? "bg-slate-800 hover:bg-slate-750 text-slate-300" : "bg-slate-100 hover:bg-slate-150 text-slate-700"}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-3">Color Accent</label>
              <div className="flex flex-col gap-2">
                {Object.entries(THEME_PALETTES).map(([key, value]) => (
                  <button
                    key={key}
                    onClick={() => setColorTheme(key)}
                    className={`w-full flex items-center justify-between p-3.5 rounded-xl text-left text-sm font-semibold border transition-all ${colorTheme === key ? isDark ? "border-blue-500 bg-slate-800" : "border-indigo-500 bg-slate-100" : isDark ? "border-slate-800 bg-slate-850 hover:bg-slate-800" : "border-slate-100 bg-slate-50 hover:bg-slate-100"}`}
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
      <div className="flex-1 flex items-center justify-center w-full">
        <div className={`w-full max-w-lg backdrop-blur-xl border rounded-3xl shadow-2xl p-6 sm:p-8 text-center transition-all duration-500 ${isDark ? "bg-slate-950/40 border-slate-750" : "bg-white/20 border-white/20"}`}>
          <div className={`w-full max-w-md rounded-2xl shadow-3xl p-6 sm:p-8 text-center mx-auto transition-all duration-500 ${isDark ? activeTheme.cardDark : `${activeTheme.card} backdrop-blur-md`}`}>
            <h1 className="text-3xl font-extrabold mb-2 tracking-tight">
              📨 Spam Detector
            </h1>
            <p className="font-semibold text-sm mb-6 opacity-75">
              Analyze messages, emails & URLs instantly
            </p>

            {/* Navigation Tabs */}
            <div className="flex flex-wrap justify-center gap-2 mb-6 border-b border-slate-500/20 pb-3 text-sm font-bold">
              <button
                onClick={() => setActiveTab("detector")}
                className={`pb-1 px-4 transition-all border-b-2 ${activeTab === "detector" ? "border-current opacity-100" : "border-transparent opacity-50 hover:opacity-75"}`}
              >
                Spam Detector
              </button>
              <button
                onClick={() => setActiveTab("bulk")}
                className={`pb-1 px-4 transition-all border-b-2 ${activeTab === "bulk" ? "border-current opacity-100" : "border-transparent opacity-50 hover:opacity-75"}`}
              >
                Bulk Detector
              </button>
              <button
                onClick={() => setActiveTab("insights")}
                className={`pb-1 px-4 transition-all border-b-2 ${activeTab === "insights" ? "border-current opacity-100" : "border-transparent opacity-50 hover:opacity-75"}`}
              >
                Insights
              </button>
              <button
                onClick={() => setActiveTab("authenticity")}
                className={`pb-1 px-4 transition-all border-b-2 ${activeTab === "authenticity" ? "border-current opacity-100" : "border-transparent opacity-50 hover:opacity-75"}`}
              >
                Sender Verifier
              </button>
              <button
                onClick={() => setActiveTab("scanner")}
                className={`pb-1 px-4 transition-all border-b-2 ${activeTab === "scanner" ? "border-current opacity-100" : "border-transparent opacity-50 hover:opacity-75"}`}
              >
                Email Scanner
              </button>
              <button
                onClick={() => setActiveTab("rules")}
                className={`pb-1 px-4 transition-all border-b-2 ${activeTab === "rules" ? "border-current opacity-100" : "border-transparent opacity-50 hover:opacity-75"}`}
              >
              <button
                 onClick={() => setShowPatternLibrary(true)}
                 className="px-4 py-2.5 rounded-xl font-bold transition-all active:scale-95 flex items-center gap-2 shadow-md"
              >
              Patterns
              </button>
                Rules Manager
              </button>
              <button
                onClick={() => setActiveTab("history")}
                className={`pb-1 px-4 transition-all border-b-2 ${activeTab === "history" ? "border-current opacity-100" : "border-transparent opacity-50 hover:opacity-75"}`}
              >
              {(result === "spam" || result === "malicious" || result === "smishing") && (
              <button
              onClick={() => setShowDeSpamify(true)}
              className="mt-3 px-4 py-2 rounded-lg bg-purple-500 hover:bg-purple-600 text-white font-semibold transition"
              >
              De-Spamify Message
              </button>
              )}

                History
              </button>
              <button
                onClick={() => navigate("/dashboard")}
                className="pb-1 px-4 transition-all border-b-2 border-transparent opacity-50 hover:opacity-75"
              >
                <span className="inline-flex items-center gap-1 whitespace-nowrap">
                  <span>📊</span>
                  <span>Dashboard</span>
                </span>
              </button>
            </div>

            {activeTab === "detector" ? (
                <>
                {/* Enhanced Input Section */}
                <div className="relative w-full mb-4 group text-left">
                  <textarea
                    className={`w-full border p-4 pr-12 rounded-2xl focus:outline-none focus:ring-2 resize-none text-sm sm:text-base transition-all shadow-inner leading-relaxed [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full ${isDark ? `${activeTheme.inputDark} focus:border-blue-500/50 [&::-webkit-scrollbar-thumb]:bg-slate-700 hover:[&::-webkit-scrollbar-thumb]:bg-slate-600` : `${activeTheme.input} focus:border-indigo-500/50 [&::-webkit-scrollbar-thumb]:bg-slate-300 hover:[&::-webkit-scrollbar-thumb]:bg-slate-400`}`}
                    rows="5"
                    placeholder={type === "url" ? "Paste or type the suspicious website link URL here to test..." : type === "message" ? "Type your SMS or chat message content here for inspection..." : "Paste the full text or body of your email content here..."}
                    value={text}
                    onChange={(e) => {
                      const value = e.target.value;
                      setText(value);
                      const detected = detectType(value);
                      setType(detected);
                    }}
                  />

                  {text && (
                    <button
                      onClick={() => setText("")}
                      className={`absolute top-3.5 right-3.5 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all hover:scale-110 shadow-sm ${isDark ? "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white" : "bg-slate-200 text-slate-500 hover:bg-slate-300 hover:text-slate-800"}`}
                      title="Clear input"
                    >
                      ✕
                    </button>
                  )}
                  {text && (
                    <div className="flex flex-wrap justify-between items-center mt-1.5 px-1 text-xs font-medium tracking-wide opacity-70 gap-1">
                      <div className="flex flex-wrap gap-3">
                       <span>📖 {calculateReadingTime(text)}</span>
                      <span>📝 {getTextStats(text).words} words</span>
                      <span>📏 Avg {getTextStats(text).avgWordLength} chars</span>
                      <span>📄 {getTextStats(text).sentences} sentences</span>
                    </div>
                    {text.length > 5000 ? (
                      <span className="text-red-500 font-bold">
                        {text.length.toLocaleString()} / 5000 characters (Limit exceeded)
                      </span>
                    ) : (
                      <span className={text.length > 500 ? "text-orange-500" : ""}>
                        {text.length.toLocaleString()} characters
                      </span>
                    )}
                  </div>)}

                </div>

                <button
                  onClick={() => {
                    if (!text.trim()) return;
                    handlePredict();
                  }}
                  disabled={loading || text.trim().length === 0 || text.length > 5000}
                  className={`mt-2 w-full py-3.5 rounded-xl font-bold text-white shadow-md active:scale-95 transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${activeTheme.accent}`}
                >
                  {loading && (
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  )}
                  {loading ? "Analyzing..." : `Analyze ${type === "url" ? "URL" : type}`}
                </button>

                {loading && (
                <div className="mt-5 p-4">
                  <Skeleton height={200} borderRadius="16px" />
                  <div className="mt-4">
                    <Skeleton height={20} width="60%" />
                    <Skeleton height={30} width="40%" />
                    <Skeleton height={10} />
                  </div>
                </div>
                )}

                {/* Error Section */}
                {result === "Error" && errorInfo && (
                  <div className={`mt-5 rounded-3xl p-5 shadow-lg border ${isDark ? "bg-yellow-500/10 border-yellow-600/40" : "bg-yellow-50 border-yellow-300"}`}>
                    <div className="flex items-start gap-3">
                      <span className="text-2xl leading-none">⚠️</span>
                      <div className="flex-1">
                        <h3 className={`text-base font-bold ${isDark ? "text-yellow-300" : "text-yellow-800"}`}>
                          {errorInfo.title}
                        </h3>
                        <p className={`mt-1 text-sm ${isDark ? "text-yellow-200/80" : "text-yellow-700"}`}>
                          {errorInfo.message}
                        </p>
                        {errorInfo.retryable && (
                          <button
                            onClick={handlePredict}
                            disabled={loading}
                            className={`mt-3 px-4 py-2 rounded-lg font-semibold text-sm transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed ${isDark ? "bg-yellow-500 text-slate-900 hover:bg-yellow-400" : "bg-yellow-500 text-white hover:bg-yellow-600"}`}
                          >
                            {loading ? "Retrying..." : "🔄 Retry"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Results Section */}
                {result && result !== "Error" && (
                  <div className={`mt-5 rounded-3xl p-5 shadow-lg border ${isDark ? "bg-slate-900/50 border-slate-700" : "bg-white/70 border-slate-200"}`}>
                    <div className="flex justify-between items-center mb-5">
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold">📊 Analysis Result</h2>
                        <button
                          onClick={() => {
                            const scoreStr = confidence !== null ? ` | Confidence: ${confidencePct}%` : "";
                            const copyText = `Prediction: ${result === 'ham' || result === 'safe' ? 'Safe' : result === 'spam' || result === 'malicious' ? 'Spam/Malicious' : result === 'smishing' ? 'Fraud' : result}${scoreStr}`;
                            navigator.clipboard.writeText(copyText);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                          }}
                          className={`ml-1 w-7 h-7 flex items-center justify-center rounded-full transition-all text-[11px] ${isDark ? "hover:bg-slate-700 bg-slate-800 text-slate-300" : "hover:bg-slate-200 bg-slate-100 text-slate-600"}`}
                          title="Copy Result to Clipboard"
                        >
                          {copied ? "✅" : "📋"}
                        </button>
                      </div>
                      <span className={`px-4 py-2 rounded-full text-sm font-bold ${result === "ham" || result === "safe" ? "bg-green-500 text-white" : result === "spam" || result === "malicious" ? "bg-red-500 text-white" : result === "smishing" ? "bg-orange-500 text-white" : "bg-yellow-500 text-white"}`}>
                        {result === "ham" && "✅ Safe"}
                        {result === "safe" && "✅ Safe"}
                        {result === "spam" && "🚫 Spam"}
                        {result === "malicious" && "🚨 Malicious"}
                        {result === "smishing" && "⚠️ Fraud"}
                        {result === "Error" && "⚠️ Error"}
                      </span>
                    </div>
                     
                    <URLPreview url={text} darkMode={isDark}>
                      <span className="text-blue-500 underline cursor-pointer">
                       {text}
                      </span>
                    </URLPreview>

                    {explanation && result !== "Error" && (
                    <PredictionExplanation 
                      explanation={explanation} 
                      result={result} 
                      darkMode={isDark} 
                     />
                    )}

                    {/* Manipulation Index */}
                    <ManipulationIndex 
                      text={text} 
                      result={result} 
                      darkMode={isDark} 
                    />

                    {confidence !== null && result !== "Error" && (
                      <>
                        <p className="text-sm opacity-70 mb-1">Confidence Score</p>
                        <h3 className="text-3xl font-bold mb-4">{confidencePct}%</h3>
                        <div className={`w-full rounded-full h-3 mb-5 ${isDark ? "bg-slate-700" : "bg-slate-200"}`} />
                      </>
                    )}

                    {result && confidence !== null && result !== "Error" && (
                      <div className="mt-4 text-left">
                        <p className="text-xs font-semibold mb-1 opacity-70">Model Confidence: {confidencePct}%</p>
                        <div className={`w-full rounded-full h-2 ${isDark ? "bg-slate-800" : "bg-slate-200"}`}>
                          <div className={`h-3 rounded-full transition-all duration-500 ${result === "ham" || result === "safe" ? "bg-green-500" : result === "spam" || result === "malicious" ? "bg-red-500" : "bg-orange-500"}`} style={{ width: `${confidencePct}%` }} />
                        </div>
                    {/* Pattern Tags - Show only for spam/malicious/smishing */}
                    {(result === "spam" || result === "malicious" || result === "smishing") && detectPatterns(text).length > 0 && (
                      <div className="mt-4 pt-3 border-t border-slate-700/20">
                       <p className="text-xs font-semibold opacity-70 mb-2 flex items-center gap-1">
                       <span>🚨</span> Spam Indicators
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {detectPatterns(text).map((pattern, index) => (
                         <span 
                          key={index}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border
                          ${pattern.severity === 'high' 
                          ? 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700' 
                          : pattern.severity === 'medium' 
                          ? 'bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700'
                          : 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700'}`}
                        >
                          <span>{pattern.icon}</span>
                         <span>{pattern.label}</span>
                      </span>
                    ))}

                    {/* Emoji Sentiment Analysis */}
                    {result && result !== "Error" && text && analyzeEmojis(text).count > 0 && (
                     <div className="mt-4 pt-3 border-t border-slate-700/20">
                      <p className="text-xs font-semibold opacity-70 mb-2 flex items-center gap-1">
                         <span>😊</span> Emoji Sentiment
                      </p>
                     <div className="flex flex-wrap items-center gap-3">
                        <span className="text-lg">
                        {analyzeEmojis(text).emojis.join(' ')}
                         </span>
                         <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                         analyzeEmojis(text).sentiment === 'positive' 
                         ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                         : analyzeEmojis(text).sentiment === 'negative'
                         ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                         : 'bg-gray-100 text-gray-700 dark:bg-gray-800/30 dark:text-gray-400'
                        }`}>
                        {analyzeEmojis(text).sentiment === 'positive' && '😊 Positive'}
                        {analyzeEmojis(text).sentiment === 'negative' && '😢 Negative'}
                        {analyzeEmojis(text).sentiment === 'neutral' && '😐 Neutral'}
                        </span>
                        {analyzeEmojis(text).spamDetected && (
                         <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500 text-white">
                          ⚠️ Spam Emojis
                         </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

                        <div className="mb-5">
                          <p className="text-sm opacity-70 mb-2">Risk Level</p>
                          <span className={`px-4 py-2 rounded-full text-sm font-semibold ${riskLevel === "Low" ? "bg-green-100 text-green-700" : riskLevel === "Medium" ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}>
                            {riskLevel === "Low" && "🟢 Low"}
                            {riskLevel === "Medium" && "🟠 Medium"}
                            {riskLevel === "High" && "🔴 High"}
                          </span>
                        </div>

                        <div className="mt-4 mb-4">
                          <button
                            onClick={() => {
                              const fullReport = `📊 Spam Detection Report\n─────────────────────\n🔍 Prediction: ${result === 'ham' || result === 'safe' ? '✅ Safe' : result === 'spam' || result === 'malicious' ? '🚫 Spam/Malicious' : result === 'smishing' ? '⚠️ Fraud' : '⚠️ Error'}\n📝 Message: ${text}\n📈 Confidence: ${confidence ? confidencePct + '%' : 'N/A'}\n⚠️ Risk Level: ${riskLevel}\n📅 Date: ${new Date().toLocaleString()}\n─────────────────────\nPowered by Spam Detection System`;
                              navigator.clipboard.writeText(fullReport);
                              setCopied(true);
                              setTimeout(() => setCopied(false), 2000);
                            }}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 w-full justify-center ${isDark ? "bg-slate-700 hover:bg-slate-600 text-slate-200" : "bg-slate-200 hover:bg-slate-300 text-slate-700"}`}
                          >
                            {copied ? '✅ Copied!' : '📋 Copy Full Report'}
                          </button>
                        </div>

                        <p className="text-sm opacity-75 leading-relaxed">
                          {(result === "spam" || result === "smishing" || result === "malicious") && "This content contains characteristics commonly found in spam, phishing, or malicious attacks."}
                          {(result === "ham" || result === "safe") && "No suspicious patterns were detected in this content."}
                        </p>
                      </div>
                    )}

                    {explanation && result !== "Error" && (
                      <PredictionExplanation explanation={explanation} result={result} />
                    )}

                    {result && result !== "Error" && type !== "url" && (
                      <FeedbackWidget key={`${text}|${result}|${confidence}`} text={text} predictedLabel={result} darkMode={isDark} />
                    )}

                    <button
                      onClick={() => {
                        setText("");
                        setResult("");
                        setConfidence(null);
                        setExplanation(null);
                        setErrorInfo(null);
                        setType("message");
                      }}
                      className={`mt-4 w-full py-3.5 rounded-xl font-bold shadow-sm transition-all ${isDark ? activeTheme.btnSecondaryDark : activeTheme.btnSecondary}`}
                    >
                      Reset
                    </button>
                  </div>
                )}

                {showDeSpamify && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                  <div className="w-full max-w-2xl">
                    <DeSpamify
                    text={text}
                    darkMode={isDark}
                    onClose={() => setShowDeSpamify(false)}
                  />
                  </div>
                </div>
                )}


                <FeatureImportance darkMode={isDark} />
                <CensorshipMode text={text} darkMode={isDark} />

                {/* SPAM WORD OF THE DAY */}
                {wordOfDay && (
                  <div className={`mt-6 p-4 rounded-xl border ${isDark ? 'bg-slate-800/30 border-slate-700' : 'bg-white/40 border-slate-200'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold opacity-70">📚 Spam Word of the Day</h3>
                      <button onClick={fetchWordOfTheDay} className="text-xs opacity-50 hover:opacity-100 transition-opacity" title="Refresh word of the day">
                        🔄
                      </button>
                    </div>
                    {wordLoading ? (
                      <div className="h-8 w-48 bg-slate-300 rounded animate-pulse"></div>
                    ) : (
                      <>
                        <div className="flex items-center gap-3">
                          <span className={`text-2xl font-bold ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`}>
                            {wordOfDay.word || 'No spam detected today'}
                          </span>
                          {wordOfDay.count && (
                            <span className="text-sm opacity-60">
                              {wordOfDay.count} {wordOfDay.count === 1 ? 'detection' : 'detections'}
                            </span>
                          )}
                        </div>
                        {wordOfDay.definition && (
                          <p className="text-sm mt-2 opacity-75 leading-relaxed">{wordOfDay.definition}</p>
                        )}
                        {wordOfDay.context && (
                          <div className={`mt-2 p-2 rounded text-xs ${isDark ? 'bg-slate-900/50' : 'bg-slate-100/50'}`}>
                            <span className="opacity-60">Example: </span>
                            <span className="italic">"{wordOfDay.context}"</span>
                          </div>
                        )}
                        {wordOfDay.tips && (
                          <div className={`mt-2 p-2 rounded text-xs ${isDark ? 'bg-blue-900/20' : 'bg-blue-50'}`}>
                            💡 {wordOfDay.tips}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                <div className="mt-6 p-4 rounded-xl border text-left">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold opacity-70">📈 Spam Detection Insights</span>
                    <div className="flex items-center gap-2">
                      {getEarnedBadges().map((badge) => (
                        <span key={badge.day} className="text-lg" title={badge.name}>
                          {badge.icon}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <WordCloud darkMode={isDark} />
              </>
            ) : activeTab === "bulk" ? (
              <BulkSpamDetection />
            ) : activeTab === "insights" ? (
              <SpamInsightsDashboard />
            ) : activeTab === "scanner" ? (
              <EmailScannerDashboard />
            ) : activeTab === "rules" ? (
              <RulesManager />
            ) : activeTab === "history" ? (
              <History />
            ) : (
              <EmailHeaderAnalyzer />
            )}

            {showCelebration && (
              <div className="celebration-modal" style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.6)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                zIndex: 1000
              }}>
                <div style={{
                  background: 'white',
                  padding: '40px',
                  borderRadius: '20px',
                  textAlign: 'center',
                  maxWidth: '400px',
                  width: '90%'
                }}>
                  <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🎉</div>
                  <h2 style={{ color: '#7c3aed' }}>First Prediction Complete!</h2>
                  <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
                    You're on your way to becoming a spam detection expert!
                  </p>
                  <button
                    onClick={() => setShowCelebration(false)}
                    style={{
                      padding: '10px 30px',
                      background: '#7c3aed',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer'
                    }}
                  >
                    Continue Learning →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <Footer darkMode={isDark} />
      <Chatbot />
    </div>
  );
}
export default App;
