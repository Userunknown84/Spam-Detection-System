import React, { useState } from 'react';

const spamPatterns = [
  {
    id: 1,
    category: 'Phishing',
    icon: '🎣',
    keywords: ['verify', 'account', 'password', 'update', 'security'],
    examples: [
      'Your account has been compromised. Verify your password immediately.',
      'Please update your account information to avoid suspension.',
    ],
    description: 'Messages trying to steal personal information by posing as legitimate services.',
  },
  {
    id: 2,
    category: 'Smishing',
    icon: '📱',
    keywords: ['bank', 'otp', 'verification', 'urgent', 'payment'],
    examples: [
      'Your bank account has been blocked. Click here to verify.',
      'Please share OTP to complete your transaction.',
    ],
    description: 'SMS-based phishing attacks trying to get sensitive information.',
  },
  {
    id: 3,
    category: 'Scam',
    icon: '💰',
    keywords: ['free', 'prize', 'winner', 'money', 'claim', 'reward'],
    examples: [
      'Congratulations! You have won $1,000,000. Claim your prize now!',
      'You are the lucky winner of our grand prize. Click here to collect.',
    ],
    description: 'Messages promising money or prizes to lure victims into sharing information.',
  },
  {
    id: 4,
    category: 'Promotional',
    icon: '📢',
    keywords: ['offer', 'discount', 'sale', 'limited', 'deal'],
    examples: [
      'Exclusive 80% off sale! Limited time only. Shop now!',
      'You have been selected for a special discount. Hurry up!',
    ],
    description: 'Unsolicited promotional messages often with false urgency.',
  },
  {
    id: 5,
    category: 'Urgency',
    icon: '⏰',
    keywords: ['urgent', 'immediate', 'action required', 'asap', 'limited time'],
    examples: [
      'URGENT: Immediate action required to secure your account.',
      'Limited time offer! Act now before it expires.',
    ],
    description: 'Messages creating false urgency to pressure users into acting quickly.',
  },
  {
    id: 6,
    category: 'Lottery',
    icon: '🎰',
    keywords: ['lottery', 'jackpot', 'win', 'lucky', 'prize'],
    examples: [
      'You have won the lottery! Claim your prize now.',
      'Congratulations! You are our lucky winner of the grand jackpot.',
    ],
    description: 'Fake lottery or prize winnings designed to collect personal information.',
  },
];

const SpamPatternLibrary = ({ isOpen, onClose, darkMode }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedPattern, setSelectedPattern] = useState(null);
    const [selectedCategory, setSelectedCategory] = useState('All');

    const categories = ['All', ...new Set(spamPatterns.map(pattern => pattern.category))];

    const filteredPatterns = spamPatterns.filter(pattern => {
        const matchesSearch = pattern.keywords.some(k => 
      k.toLowerCase().includes(searchTerm.toLowerCase())
    ) || pattern.category.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = selectedCategory === 'All' || pattern.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop with blur */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className={`relative w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden ${
        darkMode ? 'bg-slate-900 text-white' : 'bg-white text-slate-900'
      }`}>
        {/* Header */}
        <div className={`p-6 border-b ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold">📚 Spam Pattern Library</h2>
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Learn to recognize spam patterns and protect yourself
              </p>
            </div>
            <button
              onClick={onClose}
              className={`p-2 rounded-lg transition ${
                darkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-100'
              }`}
            >
              ✕
            </button>
          </div>
          
          {/* Search & Filter */}
          <div className="mt-4 flex flex-wrap gap-3">
            <input
              type="text"
              placeholder="Search patterns..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`flex-1 min-w-[200px] px-4 py-2 rounded-lg border ${
                darkMode 
                  ? 'bg-slate-800 border-slate-700 text-white' 
                  : 'bg-white border-slate-200 text-slate-900'
              }`}
            />
            <div className="flex flex-wrap gap-2">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition ${
                    selectedCategory === cat
                      ? 'bg-blue-500 text-white'
                      : darkMode
                        ? 'bg-slate-800 hover:bg-slate-700'
                        : 'bg-slate-100 hover:bg-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {filteredPatterns.length === 0 ? (
            <div className="text-center py-8 opacity-60">
              No patterns found matching your search.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredPatterns.map(pattern => (
                <div
                  key={pattern.id}
                  className={`p-4 rounded-xl border cursor-pointer transition hover:scale-[1.02] ${
                    darkMode 
                      ? 'border-slate-700 hover:border-blue-500' 
                      : 'border-slate-200 hover:border-blue-400'
                  } ${selectedPattern?.id === pattern.id ? 'ring-2 ring-blue-500' : ''}`}
                  onClick={() => setSelectedPattern(pattern)}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{pattern.icon}</span>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold">{pattern.category}</h3>
                      <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        {pattern.description}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {pattern.keywords.slice(0, 3).map(kw => (
                          <span key={kw} className={`px-2 py-0.5 rounded-full text-xs ${
                            darkMode ? 'bg-slate-800' : 'bg-slate-100'
                          }`}>
                            {kw}
                          </span>
                        ))}
                        {pattern.keywords.length > 3 && (
                          <span className="text-xs opacity-50">+{pattern.keywords.length - 3}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pattern Detail */}
        {selectedPattern && (
          <div className={`p-6 border-t ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
            <div className="flex justify-between items-start">
              <div>
                <h4 className="font-semibold flex items-center gap-2">
                  <span>{selectedPattern.icon}</span>
                  {selectedPattern.category}
                </h4>
                <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  {selectedPattern.description}
                </p>
              </div>
              <button
                onClick={() => setSelectedPattern(null)}
                className={`text-sm ${darkMode ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-black'}`}
              >
                Close
              </button>
            </div>
            <div className="mt-3">
              <p className="text-sm font-medium mb-2">⚠️ Example Messages:</p>
              <div className="space-y-2">
                {selectedPattern.examples.map((example, i) => (
                  <div key={i} className={`p-3 rounded-lg ${
                    darkMode ? 'bg-slate-800' : 'bg-slate-50'
                  }`}>
                    <p className="text-sm">{example}</p>
                    <p className={`text-xs mt-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      🔍 Keywords: {selectedPattern.keywords.join(', ')}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className={`p-4 border-t ${darkMode ? 'border-slate-700' : 'border-slate-200'} text-center text-xs opacity-60`}>
          🛡️ Help us grow this library by contributing new patterns
        </div>
      </div>
    </div>
  );
};

export default SpamPatternLibrary;
