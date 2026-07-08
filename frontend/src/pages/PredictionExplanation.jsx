import React from 'react';

const PredictionExplanation = ({ explanation, result, darkMode }) => {
  if (!explanation) return null;

  const isSpam = result === 'spam' || result === 'malicious';

  return (
    <div className={`mt-4 p-4 rounded-lg ${darkMode ? 'bg-slate-800/50' : 'bg-slate-100/50'}`}>
      <h4 className="text-sm font-semibold mb-2">📝 Why this was classified as {isSpam ? 'SPAM' : 'SAFE'}</h4>
      
      {/* Simple word importance display */}
      {explanation.word_importance && (
        <div className="flex flex-wrap gap-1 mt-2">
          {Object.entries(explanation.word_importance).map(([word, score]) => (
            <span
              key={word}
              className={`px-2 py-1 rounded text-xs font-medium ${
                score > 0.5
                  ? isSpam
                    ? 'bg-red-500/20 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    : 'bg-green-500/20 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-gray-500/20 text-gray-700 dark:bg-gray-800/30 dark:text-gray-400'
              }`}
              style={{ opacity: Math.abs(score) }}
            >
              {word} ({Math.round(score * 100)}%)
            </span>
          ))}
        </div>
      )}

      {/* Simple explanation text */}
      {explanation.reason && (
        <p className="text-sm mt-2 opacity-80">{explanation.reason}</p>
      )}

      {/* If no detailed explanation, show a simple one */}
      {!explanation.word_importance && !explanation.reason && (
        <p className="text-sm opacity-80">
          {isSpam
            ? 'This message contains patterns commonly found in spam.'
            : 'This message appears to be legitimate.'}
        </p>
      )}
    </div>
  );
};

export default PredictionExplanation;