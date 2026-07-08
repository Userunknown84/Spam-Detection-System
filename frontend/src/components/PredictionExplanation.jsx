import React from "react";

export default function PredictionExplanation({ explanation, result, confidencePct }) {
  if (!explanation) return null;

  const indicatorLabels = Object.entries(explanation.spam_patterns)
    .filter(([, value]) => value)
    .map(([key]) => key.replace(/_/g, " "));

  // FAANG-level XAI Confidence Normalization & Color Logic
  const score = Number(confidencePct || 0);
  let progressColor = "bg-yellow-500";
  let statusText = "Uncertain";

  if (result === "ham" || result === "safe") {
    progressColor = score >= 80 ? "bg-green-500" : "bg-green-400";
    statusText = score >= 80 ? "High Confidence" : "Moderate Confidence";
  } else if (result === "spam" || result === "malicious" || result === "smishing") {
    progressColor = score >= 80 ? "bg-red-500" : "bg-red-400";
    statusText = score >= 80 ? "High Confidence" : "Moderate Confidence";
  }

  return (
    <div className="mt-6 p-6 rounded-3xl border shadow-lg bg-white/90 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-left">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <p className="text-sm uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400 font-bold">
            Explainable AI Insight
          </p>
          <h2 className="text-2xl font-extrabold mt-2">Prediction Details</h2>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400 font-bold">Risk score</p>
          <p className="text-4xl font-black text-slate-900 dark:text-white">{explanation.score}%</p>
        </div>
      </div>

      {/* 🚀 The New Visual Confidence Meter */}
      {confidencePct && (
        <div className="mb-6 p-5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-inner">
          <div className="flex justify-between items-end mb-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-bold mb-1">Model Certainty</p>
              <p className="text-xl font-bold">
                {confidencePct}% <span className="text-sm font-medium text-slate-500 ml-1">({statusText})</span>
              </p>
            </div>
          </div>
          <div className="w-full h-4 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner">
            <div 
              className={`h-full ${progressColor} transition-all duration-1000 ease-out`} 
              style={{ width: `${confidencePct}%` }}
            />
          </div>
        </div>
      )}

      {/* Grid Status */}
      <div className="grid gap-4 md:grid-cols-2 mb-6">
        <div className="rounded-2xl p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400 font-bold mb-2">Final Classification</p>
          <p className="text-lg font-bold capitalize">{result}</p>
        </div>
        <div className="rounded-2xl p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400 font-bold mb-2">Indicators Triggered</p>
          <p className="text-lg font-bold">{explanation.num_indicators}</p>
        </div>
      </div>

      {/* Reasons List */}
      <div className="mb-6">
        <p className="text-sm font-bold mb-3 uppercase tracking-wider opacity-80">Reasoning Breakdown</p>
        <ul className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
          {explanation.reasons.length > 0 ? (
            explanation.reasons.map((reason) => (
              <li key={reason} className="flex items-start gap-3 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-700/50">
                <span className="mt-0.5 text-green-600 dark:text-green-400 font-bold">✓</span>
                <span className="font-medium">{reason}</span>
              </li>
            ))
          ) : (
            <li className="text-slate-500 dark:text-slate-400 italic">No suspicious patterns detected by the model.</li>
          )}
        </ul>
      </div>

      {/* Matched Keywords */}
      {explanation.matched_keywords.length > 0 && (
        <div className="mb-6">
          <p className="text-sm font-bold mb-3 uppercase tracking-wider opacity-80">Keyword Triggers</p>
          <div className="flex flex-wrap gap-2">
            {explanation.matched_keywords.map((keyword) => (
              <span
                key={keyword}
                className="px-4 py-1.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
              >
                {keyword}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Spam Patterns */}
      {indicatorLabels.length > 0 && (
        <div>
          <p className="text-sm font-bold mb-3 uppercase tracking-wider opacity-80">Heuristic Patterns</p>
          <div className="flex flex-wrap gap-2">
            {indicatorLabels.map((indicator) => (
              <span
                key={indicator}
                className="px-4 py-1.5 rounded-full border border-slate-300 text-xs font-bold text-slate-700 bg-white dark:bg-slate-900 dark:border-slate-600 dark:text-slate-300 shadow-sm"
              >
                {indicator}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}