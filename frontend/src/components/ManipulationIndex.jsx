#Manipulation
import React from 'react';

const ManipulationIndex = ({ text, result, darkMode }) => {
    if(! text || result != 'spam') return null;

    const analyzeManipulation = (text) => {
        const techniques = [];
        let score=0;

        const patterns =[
      { name: 'Urgency', keywords: ['urgent', 'immediate', 'act now', 'asap', 'hurry', 'limited time'], score: 15 },
      { name: 'Fear', keywords: ['account', 'locked', 'suspended', 'blocked', 'security', 'risk'], score: 15 },
      { name: 'Greed', keywords: ['free', 'win', 'prize', 'money', 'reward', 'winner', 'claim'], score: 15 },
      { name: 'Authority', keywords: ['bank', 'government', 'official', 'admin', 'security team'], score: 10 },
      { name: 'Scarcity', keywords: ['limited', 'only', 'few left', 'expires', 'last chance'], score: 10 },
      { name: 'Flattery', keywords: ['selected', 'lucky', 'special', 'exclusive', 'chosen'], score: 5 },
      { name: 'Curiosity', keywords: ['guess', 'believe', 'imagine', 'discover', 'secret'], score: 5 },
        ];

        const lowerText = text.toLowerCase();

        patterns.forEach(pattern => {
            if(pattern.keywords.some(kw => lowerText.includes(kw))) {
        techniques.push(pattern.name);
        score += pattern.score;
      }
    });

    // Deduct for clean language
    const cleanWords = ['please', 'thank you', 'kindly', 'respect'];
    if (cleanWords.some(w => lowerText.includes(w))) {
      score = Math.max(0, score - 5);
    }

    // Cap at 100
    score = Math.min(100, score);

    // Determine risk level
    let riskLevel = 'Low';
    let riskColor = 'green';
    let riskIcon = '🟢';
    
    if (score >= 70) {
      riskLevel = 'Critical';
      riskColor = 'red';
      riskIcon = '🔴';
    } else if (score >= 50) {
      riskLevel = 'High';
      riskColor = 'orange';
      riskIcon = '🟠';
    } else if (score >= 25) {
      riskLevel = 'Medium';
      riskColor = 'yellow';
      riskIcon = '🟡';
    }

    return {
      score,
      techniques,
      riskLevel,
      riskColor,
      riskIcon,
      techniqueCount: techniques.length
    };
  };

  const analysisResult = analyzeManipulation(text);

  return(
    <div className={`mt-4 p-4 rounded-xl border ${darkMode ? 'bg-slate-800/30 border-slate-700' : 'bg-white/40 border-slate-200'}`}>
      <h4 className="text-sm font-semibold flex items-center gap-2 mb-3">
        🎯 Manipulation Index
      </h4>

      {/* Score */}
      <div className="flex items-center gap-4 mb-3">
        <div className="relative w-20 h-20">
          <svg className="w-20 h-20 transform -rotate-90">
            <circle
              cx="40"
              cy="40"
              r="32"
              stroke={darkMode ? '#1e293b' : '#e5e7eb'}
              strokeWidth="6"
              fill="none"
            />
            <circle
              cx="40"
              cy="40"
              r="32"
              stroke={
                analysisResult.score >= 70 ? '#ef4444' :
                analysisResult.score >= 50 ? '#f97316' :
                analysisResult.score >= 25 ? '#eab308' :
                '#22c55e'
              }
              strokeWidth="6"
              fill="none"
              strokeDasharray={`${(analysisResult.score / 100) * 200.96} 200.96`}
              strokeLinecap="round"
              className="transition-all duration-500"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-2xl font-bold">{analysisResult.score}%</span>
          </div>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">{analysisResult.riskIcon}</span>
            <span className={`text-lg font-bold text-${analysisResult.riskColor}-500`}>
              {analysisResult.riskLevel}
            </span>
          </div>
          <p className={`text-sm opacity-60`}>
            {analysisResult.techniqueCount} manipulation technique{analysisResult.techniqueCount !== 1 ? 's' : ''} detected
          </p>
        </div>
      </div>

      {/* Techniques Breakdown */}
      {analysisResult.techniques.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {analysisResult.techniques.map((tech, i) => (
            <span
              key={i}
              className={`px-2 py-1 rounded-full text-xs font-medium ${
                darkMode 
                  ? 'bg-slate-700 text-slate-200' 
                  : 'bg-slate-200 text-slate-700'
              }`}
            >
              {tech}
            </span>
          ))}
        </div>
      )}

      {/* Score Legend */}
      <div className="mt-3 pt-3 border-t border-slate-700/20">
        <div className="flex justify-between text-xs opacity-60">
          <span>🟢 Low (0-24)</span>
          <span>🟡 Medium (25-49)</span>
          <span>🟠 High (50-69)</span>
          <span>🔴 Critical (70+)</span>
        </div>
      </div>
    </div>
  );
};

export default ManipulationIndex;
