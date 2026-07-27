import React, { useState } from 'react';
import api from '../utils/axiosInstance';

// Optional: agar toast library use karte ho toh import karo, nahi toh hata dena
// import toast from 'react-hot-toast';

const DeSpamify = ({ text, darkMode, onClose }) => {
  const [deSpammedText, setDeSpammedText] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [tone, setTone] = useState('neutral');
  const [showOriginal, setShowOriginal] = useState(true);

  const deSpamifyText = async () => {
    // ✅ Prevent if no text
    if (!text || !text.trim()) {
      // Agar toast hai toh dikhao
      if (typeof toast !== 'undefined') {
        toast.error('Please enter some text to de-spamify');
      }
      return;
    }
    
    // ✅ Start loading
    setLoading(true);
    
    try {
      const response = await api.post('/api/despamify', {
        text: text,
        tone: tone
      });
      setDeSpammedText(response.data.deSpammedText);
      
      // ✅ Success toast (optional)
      if (typeof toast !== 'undefined') {
        toast.success('✨ Message de-spamified successfully!');
      }
    } catch (error) {
      console.error('De-spamification failed:', error);
      
      // ✅ Fallback
      const fallback = deSpamifyFallback(text);
      setDeSpammedText(fallback);
      
      // ✅ Error toast (optional)
      if (typeof toast !== 'undefined') {
        toast.error('Failed to de-spamify. Using fallback...');
      }
    } finally {
      // ✅ Stop loading
      setLoading(false);
    }
  };

  const deSpamifyFallback = (text) => {
    let result = text;
    const replacements = {
      'URGENT': 'Someone wants to contact you',
      'FREE': 'There is an offer',
      'WIN': 'There is a notification',
      'PRIZE': 'There is a message about rewards',
      'CLAIM': 'There is a message for you',
      'CLICK': 'There is a link to visit',
      'NOW': 'soon',
      '!!!': '.',
      '$$$': '',
      '100%': '',
      'GUARANTEED': '',
      'LIMITED TIME': '',
      'ACT NOW': '',
      'DON\'T MISS': '',
      'EXCLUSIVE': '',
      'YOU WON': 'There is a notification'
    };
    
    const escapeRegex = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (const [key, value] of Object.entries(replacements)) {
      result = result.replace(new RegExp(escapeRegex(key), 'gi'), value);
    }
    
    result = result.replace(/\s+/g, ' ').trim();
    return result || 'Someone wants to contact you.';
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(deSpammedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: 'De-Spammed Message',
        text: deSpammedText
      });
    }
  };

  const getToneLabel = (tone) => {
    const tones = {
      neutral: '😐 Neutral',
      friendly: '😊 Friendly',
      formal: '📝 Formal',
      casual: '😎 Casual'
    };
    return tones[tone] || tone;
  };

  return (
    <div className={`p-4 rounded-xl border ${darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white/70 border-slate-200'}`}>
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <span>🛡️</span> De-Spamification
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`px-3 py-1.5 rounded-lg text-sm transition ${darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}
          >
            ⚙️
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className={`p-1.5 rounded-lg transition ${darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Settings */}
      {showSettings && (
        <div className={`p-3 rounded-lg mb-4 ${darkMode ? 'bg-slate-700/50' : 'bg-slate-100'}`}>
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Tone:</label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className={`px-3 py-1.5 rounded-lg border ${darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-slate-300'}`}
              >
                <option value="neutral">Neutral</option>
                <option value="friendly">Friendly</option>
                <option value="formal">Formal</option>
                <option value="casual">Casual</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Show Original:</label>
              <button
                onClick={() => setShowOriginal(!showOriginal)}
                className={`px-3 py-1.5 rounded-lg border ${showOriginal ? 'bg-blue-500 text-white' : darkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-slate-300'}`}
              >
                {showOriginal ? '✅ On' : '❌ Off'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Original Text */}
      {showOriginal && text && (
        <div className={`p-3 rounded-lg mb-3 ${darkMode ? 'bg-red-900/20 border border-red-700/30' : 'bg-red-50 border border-red-200'}`}>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-red-500">⚠️ Original:</span>
            <span className="text-xs opacity-60">Spam detected</span>
          </div>
          <p className="text-sm break-words">{text}</p>
        </div>
      )}

      {/* ✅ MAIN BUTTON WITH LOADING SPINNER */}
      <button
        onClick={deSpamifyText}
        disabled={loading}
        className="w-full py-2.5 rounded-lg font-semibold transition bg-green-500 hover:bg-green-600 text-white disabled:opacity-50"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            {/* ✅ Spinner Animation */}
            <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
            De-Spamifying...
          </span>
        ) : (
          '🛡️ De-Spamify Message'
        )}
      </button>

      {/* Result */}
      {deSpammedText && (
        <div className="mt-3 space-y-3">
          <div className={`p-3 rounded-lg ${darkMode ? 'bg-green-900/20 border border-green-700/30' : 'bg-green-50 border border-green-200'}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-semibold text-green-500">✅ Safe Version:</span>
              <span className="text-xs opacity-60">({getToneLabel(tone)})</span>
            </div>
            <p className="text-sm break-words">{deSpammedText}</p>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleCopy}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${copied ? 'bg-green-500 text-white' : darkMode ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-200 hover:bg-slate-300'}`}
            >
              {copied ? '✅ Copied!' : '📋 Copy'}
            </button>
            <button
              onClick={handleShare}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${darkMode ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-200 hover:bg-slate-300'}`}
            >
              📤 Share
            </button>
            <button
              onClick={() => setDeSpammedText('')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${darkMode ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-200 hover:bg-slate-300'}`}
            >
              🔄 Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeSpamify;
