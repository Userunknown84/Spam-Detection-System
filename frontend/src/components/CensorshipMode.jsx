import React, { useState } from 'react';

const CensorshipMode = ({ text, darkMode }) => {
  const [isCensored, setIsCensored] = useState(true);
  const [copySuccess, setCopySuccess] = useState(false);

  const censorText = (text) => {
    if (!text) return text;

    let censored = text;

    // Censor phone numbers (Indian format)
    censored = censored.replace(/\b\d{10}\b/g, 'XXX-XXX-XXXX');
    censored = censored.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, 'XXX-XXX-XXXX');
    censored = censored.replace(/\+\d{1,3}\s?\d{10}/g, '+XX XXXXXXXXXX');

    // Censor email addresses
    censored = censored.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[email protected]');

    // Censor bank account numbers
    censored = censored.replace(/\b\d{12,18}\b/g, 'XXXX-XXXX-XXXX');
    censored = censored.replace(/[A-Z]{4}\d{4}[A-Z]{1}\d{7}/g, 'XXXX-XXXX-XXXX');

    // Censor credit card numbers
    censored = censored.replace(/\b\d{4}[-.]?\d{4}[-.]?\d{4}[-.]?\d{4}\b/g, 'XXXX-XXXX-XXXX-XXXX');
    censored = censored.replace(/\b\d{16}\b/g, 'XXXX-XXXX-XXXX-XXXX');

    // Censor Aadhar (India)
    censored = censored.replace(/\b\d{4}\s?\d{4}\s?\d{4}\b/g, 'XXXX-XXXX-XXXX');

    // Censor PAN (India)
    censored = censored.replace(/[A-Z]{5}\d{4}[A-Z]{1}/g, 'XXXXX-XXXX-X');

    // Censor IFSC (India)
    censored = censored.replace(/[A-Z]{4}0[A-Z0-9]{6}/g, 'XXXX-XXXX-XXXX');

    return censored;
  };

  const getSensitiveInfo = (text) => {
    const info = [];
    
    // Detect phone numbers
    const phoneMatches = text.match(/\b\d{10}\b|\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g) || [];
    if (phoneMatches.length > 0) info.push({ type: '📱 Phone Numbers', count: phoneMatches.length });

    // Detect emails
    const emailMatches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    if (emailMatches.length > 0) info.push({ type: '📧 Email Addresses', count: emailMatches.length });

    // Detect bank account numbers
    const bankMatches = text.match(/\b\d{12,18}\b/g) || [];
    if (bankMatches.length > 0) info.push({ type: '🏦 Bank Accounts', count: bankMatches.length });

    // Detect credit cards
    const cardMatches = text.match(/\b\d{4}[-.]?\d{4}[-.]?\d{4}[-.]?\d{4}\b/g) || [];
    if (cardMatches.length > 0) info.push({ type: '💳 Credit Cards', count: cardMatches.length });

    return info;
  };

  const handleCopy = () => {
    const textToCopy = isCensored ? censorText(text) : text;
    navigator.clipboard.writeText(textToCopy);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const sensitiveInfo = getSensitiveInfo(text);

  return (
    <div className={`p-4 rounded-xl border ${darkMode ? 'bg-slate-800/30 border-slate-700' : 'bg-white/40 border-slate-200'}`}>
      <div className="flex justify-between items-center mb-3">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          🛡️ Censorship Mode
        </h4>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <span className="opacity-60">Original</span>
            <div
              className="relative w-12 h-6 rounded-full cursor-pointer transition-all"
              style={{
                background: isCensored ? '#3b82f6' : '#64748b'
              }}
              onClick={() => setIsCensored(!isCensored)}
            >
              <div
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${
                  isCensored ? 'right-0.5' : 'left-0.5'
                }`}
              />
            </div>
            <span className="opacity-60">Censored</span>
          </label>
          <button
            onClick={handleCopy}
            className={`px-2 py-1 rounded text-xs font-medium transition ${
              darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-200'
            }`}
          >
            {copySuccess ? '✅ Copied!' : '📋 Copy'}
          </button>
        </div>
      </div>

      {/* Sensitive Info Count */}
      {sensitiveInfo.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {sensitiveInfo.map((info, i) => (
            <span
              key={i}
              className={`px-2 py-0.5 rounded-full text-xs ${
                darkMode ? 'bg-yellow-900/30 text-yellow-400' : 'bg-yellow-100 text-yellow-700'
              }`}
            >
              {info.type}: {info.count}
            </span>
          ))}
        </div>
      )}

      {/* Text Display */}
      <div className="relative">
        <div className={`p-3 rounded-lg font-mono text-sm whitespace-pre-wrap break-words ${
          darkMode ? 'bg-slate-900/50' : 'bg-slate-100/50'
        }`}>
          {isCensored ? censorText(text) : text}
        </div>
      </div>

      {/* Legend */}
      {isCensored && sensitiveInfo.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-700/20">
          <p className="text-xs opacity-60">🔒 Sensitive information has been masked</p>
          <div className="flex flex-wrap gap-3 mt-1 text-xs">
            <span>📱 = Phone</span>
            <span>📧 = Email</span>
            <span>🏦 = Bank</span>
            <span>💳 = Card</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default CensorshipMode;