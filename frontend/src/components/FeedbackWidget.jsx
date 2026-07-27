import { useState } from "react";
import api from "../utils/axiosInstance";

const LABELS = ["ham", "spam", "smishing"];

const LABEL_DISPLAY = {
  ham: "Safe (Ham)",
  spam: "Spam",
  smishing: "Smishing",
};

export default function FeedbackWidget({ text, predictedLabel, darkMode, historyId }) {
  const [submitted, setSubmitted] = useState(false);
  const [showCorrection, setShowCorrection] = useState(false);
  const [correctLabel, setCorrectLabel] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState(null);

  const submitFeedback = async (label) => {
    setError(null);
    try {
      await api.post('/feedback', {
        text,
        predicted_label: predictedLabel,
        correct_label: label,
        historyId,
        note
      });
      setSubmitted(true);
    } catch {
      setError("Could not submit feedback. Please try again.");
    }
  };

  if (submitted) {
    return (
      <p className={`mt-3 text-sm font-medium ${darkMode ? "text-green-400" : "text-green-700"}`}>
        ✅ Thanks for your feedback!
      </p>
    );
  }

  return (
    <div className={`mt-4 p-3 rounded-xl border text-left ${
      darkMode ? "bg-gray-800/70 border-gray-600 text-white" : "bg-white/40 border-white/30 text-black"
    }`}>
      <p className="text-sm font-medium mb-2">Was this prediction correct?</p>

      <div className="flex gap-2">
        <button
          onClick={() => submitFeedback(predictedLabel)}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-500 transition-all"
        >
          👍 Yes
        </button>
        <button
          onClick={() => setShowCorrection(true)}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-500 transition-all"
        >
          👎 No
        </button>
      </div>

      {showCorrection && (
        <div className="mt-3">
          <label className="block text-xs font-medium mb-1">What should it have been?</label>
          <select
            value={correctLabel}
            onChange={(e) => setCorrectLabel(e.target.value)}
            className={`w-full p-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              darkMode ? "bg-gray-700 text-white border-gray-600" : "bg-white text-black border-gray-300"
            }`}
          >
            <option value="">Select correct label</option>
            {LABELS.filter((l) => l !== predictedLabel).map((l) => (
              <option key={l} value={l}>
                {LABEL_DISPLAY[l]}
              </option>
            ))}
          </select>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note about why (e.g. 'This is an important work email')"
            className={`mt-2 w-full p-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              darkMode ? "bg-gray-700 text-white border-gray-600" : "bg-white text-black border-gray-300"
            }`}
            rows={2}
            maxLength={500}
          />
          <button
            onClick={() => submitFeedback(correctLabel)}
            disabled={!correctLabel}
            className="mt-2 w-full py-2 rounded-lg text-sm font-medium bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            Submit
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  );
}
