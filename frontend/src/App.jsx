import { useState } from "react";
import axios from "axios";

function App() {
  const [text, setText] = useState("");
  const [type, setType] = useState("message");
  const [loading, setLoading] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);

  const handlePredict = async () => {
    if (!text.trim()) return;

    try {
      setLoading(true);

      const res = await axios.post(
        import.meta.env.VITE_API_URI,
        {
          text,
          type,
        }
      );

      setResult(res.data);

      setHistory((prev) => [
        {
          text:
            text.length > 40
              ? text.substring(0, 40) + "..."
              : text,
          prediction: res.data.prediction,
        },
        ...prev.slice(0, 4),
      ]);
    } catch (err) {
      setResult({
        prediction: "Error",
      });
    } finally {
      setLoading(false);
    }
  };

  const resetAll = () => {
    setText("");
    setResult(null);
    setType("message");
  };

  const predictionConfig = {
    ham: {
      title: "Safe Message",
      icon: "✅",
      color: "text-green-600",
      bg: "bg-green-100",
    },
    spam: {
      title: "Spam Detected",
      icon: "🚨",
      color: "text-red-600",
      bg: "bg-red-100",
    },
    smishing: {
      title: "Fraud Alert",
      icon: "⚠️",
      color: "text-orange-600",
      bg: "bg-orange-100",
    },
  };

  const current =
    predictionConfig[result?.prediction] || {};

  return (
    <div
      className={`min-h-screen flex items-center justify-center px-4 transition-all duration-500 ${
        darkMode
          ? "bg-gradient-to-br from-black via-gray-900 to-gray-800"
          : "bg-gradient-to-br from-blue-500 via-purple-400 to-cyan-500"
      }`}
    >
      {/* Theme Button */}
      <button
        onClick={() => setDarkMode(!darkMode)}
        className={`absolute top-5 right-5 px-4 py-2 rounded-xl font-semibold transition ${
          darkMode
            ? "bg-yellow-400 text-black"
            : "bg-gray-900 text-white"
        }`}
      >
        {darkMode ? "☀ Light" : "🌙 Dark"}
      </button>

      <div
        className={`w-full max-w-2xl rounded-3xl p-8 backdrop-blur-xl shadow-2xl transition-all ${
          darkMode
            ? "bg-gray-900/70 text-white border border-gray-700"
            : "bg-white/20 border border-white/30"
        }`}
      >
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-2">
            🛡️ SafeGuard AI
          </h1>

          <p
            className={`text-sm ${
              darkMode
                ? "text-gray-300"
                : "text-gray-800"
            }`}
          >
            Intelligent Spam & Phishing Detection
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mt-6">
          <div className="bg-white/20 backdrop-blur-md rounded-xl p-3 text-center">
            <h3 className="font-bold text-lg">
              98%
            </h3>
            <p className="text-xs">Accuracy</p>
          </div>

          <div className="bg-white/20 backdrop-blur-md rounded-xl p-3 text-center">
            <h3 className="font-bold text-lg">
              AI
            </h3>
            <p className="text-xs">
              Powered
            </p>
          </div>

          <div className="bg-white/20 backdrop-blur-md rounded-xl p-3 text-center">
            <h3 className="font-bold text-lg">
              24/7
            </h3>
            <p className="text-xs">
              Protection
            </p>
          </div>
        </div>

        {/* Type Selection */}
        <select
          value={type}
          onChange={(e) =>
            setType(e.target.value)
          }
          className={`w-full mt-6 p-3 rounded-xl border focus:outline-none ${
            darkMode
              ? "bg-gray-800 border-gray-600"
              : "bg-white"
          }`}
        >
          <option value="message">
            SMS Message
          </option>
          <option value="email">
            Email
          </option>
        </select>

        {/* Input */}
        <textarea
          rows="5"
          value={text}
          onChange={(e) =>
            setText(e.target.value)
          }
          placeholder={
            type === "email"
              ? "Paste email content..."
              : "Enter SMS or message..."
          }
          className={`w-full mt-4 p-4 rounded-xl border resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
            darkMode
              ? "bg-gray-800 border-gray-600 text-white"
              : "bg-white"
          }`}
        />

        {/* Character Counter */}
        <div className="text-right text-xs mt-1 opacity-70">
          {text.length}/1000
        </div>

        {/* Buttons */}
        <div className="flex gap-3 mt-4">
          <button
            disabled={loading}
            onClick={handlePredict}
            className={`flex-1 py-3 rounded-xl font-semibold text-white transition ${
              loading
                ? "bg-gray-500 cursor-not-allowed"
                : "bg-indigo-600 hover:bg-indigo-700"
            }`}
          >
            {loading
              ? "Analyzing..."
              : "Analyze"}
          </button>

          <button
            onClick={resetAll}
            className="flex-1 py-3 rounded-xl font-semibold bg-gray-600 text-white hover:bg-gray-700"
          >
            Reset
          </button>
        </div>

        {/* Result */}
        {result && (
          <div
            className={`mt-6 rounded-2xl p-5 ${
              current.bg ||
              "bg-red-100"
            }`}
          >
            <div className="text-center">
              <div className="text-4xl mb-2">
                {current.icon}
              </div>

              <h2
                className={`text-xl font-bold ${
                  current.color
                }`}
              >
                {current.title ||
                  "Something went wrong"}
              </h2>

              {result.confidence && (
                <p className="mt-2 text-gray-700">
                  Confidence:{" "}
                  <span className="font-bold">
                    {result.confidence}%
                  </span>
                </p>
              )}
            </div>

            {result.reasons &&
              result.reasons.length >
                0 && (
                <div className="mt-4">
                  <h3 className="font-semibold mb-2">
                    Detection Reasons:
                  </h3>

                  <ul className="space-y-2 text-sm">
                    {result.reasons.map(
                      (
                        reason,
                        index
                      ) => (
                        <li
                          key={index}
                          className="flex gap-2"
                        >
                          <span>
                            •
                          </span>
                          <span>
                            {reason}
                          </span>
                        </li>
                      )
                    )}
                  </ul>
                </div>
              )}
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div className="mt-8">
            <h3 className="font-bold mb-3">
              Recent Scans
            </h3>

            <div className="space-y-2">
              {history.map(
                (item, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded-xl text-sm flex justify-between ${
                      darkMode
                        ? "bg-gray-800"
                        : "bg-white/40"
                    }`}
                  >
                    <span>
                      {item.text}
                    </span>

                    <span className="font-semibold">
                      {
                        item.prediction
                      }
                    </span>
                  </div>
                )
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;