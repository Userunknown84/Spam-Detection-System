import React, {useState} from 'react';

// Maps the backend's domain_analysis-derived risk level (issue #822) to this
// component's existing status vocabulary, so the preview UI stays the same
// regardless of whether the signal came from the server or the local
// fallback heuristic below.
const URL_RISK_LEVEL_TO_STATUS = {
    SAFE: 'safe',
    WARNING: 'warning',
    BLOCK: 'danger',
};

const URLPreview = ({ url, children, darkMode, urlRisk }) => {
    const [showPreview, setShowPreview] = useState(false);
    const [previewData, setPreviewData] = useState(null);
    const [loading, setLoading] = useState(false);

    const extractDomain = (url) => {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname;
        } catch {
            return url;
        }
    };

    const getSafetyStatus = (domain) => {
        const suspiciousPatterns = [
           'bit.ly', 'tinyurl', 'short.url', 'goo.gl',
           'cutt.ly', 'ow.ly', 'is.gd', 'buff.ly'
        ];
    
        const suspiciousKeywords = [
          'free', 'prize', 'win', 'claim', 'urgent',
          'click', 'verify', 'update', 'account'
        ];
          
        const domainLower = domain.toLowerCase();
        if (suspiciousPatterns.some(p => domainLower.includes(p))) {
      return { status: 'warning', label: 'Suspicious URL Shortener', color: '#f59e0b' };
      }
    
      if (suspiciousKeywords.some(k => domainLower.includes(k))) {
        return { status: 'danger', label: 'Suspicious Domain', color: '#ef4444' };
      }
    
        return { status: 'safe', label: 'Domain looks safe', color: '#22c55e' };
      };

      const checkDomainReputation = async (domain) => {
    try {
      // Prefer the backend's real risk signal (domain age, DNSBL/threat
      // intel checks, suspicious-TLD/IP heuristics - see domain_checker.py)
      // when the /predict response already analyzed this URL. Only fall
      // back to the local shortener/keyword heuristic when it hasn't run
      // yet (e.g. hovering before submitting).
      const status = urlRisk
        ? {
            status: URL_RISK_LEVEL_TO_STATUS[urlRisk.level] || 'unknown',
            label: `Risk score ${urlRisk.score}/100 (${urlRisk.level})`,
            color: getStatusColor(URL_RISK_LEVEL_TO_STATUS[urlRisk.level]),
          }
        : getSafetyStatus(domain);
      setPreviewData({
        domain,
        status: status.status,
        label: status.label,
        color: status.color,
        timestamp: new Date().toLocaleString()
      });
    } catch (error) {
      console.error('Reputation check failed:', error);
      setPreviewData({
        domain,
        status: 'unknown',
        label: 'Unable to check domain reputation',
        color: '#6b7280'
      });
    }
  };

  const handleHover = () => {
    if (!url) return;
    setShowPreview(true);
    setLoading(true);
    
    const domain = extractDomain(url);
    checkDomainReputation(domain);
    setLoading(false);
  };

  const handleLeave = () => {
    setShowPreview(false);
  };

  const handleClick = (e) => {
    if (previewData?.status === 'danger' || previewData?.status === 'warning') {
      e.preventDefault();
      const confirmClick = window.confirm(
        `⚠️ Warning: This URL appears suspicious!\n\nDomain: ${previewData.domain}\nStatus: ${previewData.label}\n\nAre you sure you want to proceed?`
      );
      if (!confirmClick) {
        e.stopPropagation();
      }
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
        case 'safe': return '#22c55e'; // green
        case 'warning': return '#f59e0b'; // yellow
        case 'danger': return '#ef4444'; // red
        default: return '#6b7280'; // gray
    }
    };

  const getStatusIcon = (status) => {
    switch (status) {
        case 'safe': return '✅'; // green check
        case 'warning': return '⚠️'; // yellow warning
        case 'danger': return '❌'; // red cross
        default: return '❓'; // gray question
    }
};

    return (
       <span
        className={`relative inline-block ${darkMode ? 'text-white' : 'text-black'}`}
        onMouseEnter={handleHover}
        onMouseLeave={handleLeave}
        onClick={handleClick}
        >
            {children}
        {showPreview && (
            <div className={`absolute bottom-full left-0 mb-2 p-3 rounded-lg shadow-xl border min-w-[250px] z-50 ${
          darkMode 
            ? 'bg-slate-800 border-slate-700' 
            : 'bg-white border-slate-200'
        }`}>
          {loading ? (
            <div className="flex items-center justify-center py-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
              <span className="ml-2 text-sm">Checking URL...</span>
            </div>
          ) : previewData && (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                  🔗 URL Preview
                </span>
                <span 
                  className="px-2 py-0.5 rounded-full text-xs text-white"
                  style={{ backgroundColor: getStatusColor(previewData.status) }}
                >
                  {getStatusIcon(previewData.status)} {previewData.status}
                </span>
              </div>
              
              <div className={`text-xs ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                <p><strong>Domain:</strong> {previewData.domain}</p>
                <p><strong>Status:</strong> {previewData.label}</p>
                {previewData.timestamp && (
                  <p className="text-xs opacity-50 mt-1">Checked: {previewData.timestamp}</p>
                )}
              </div>
              
              {previewData.status === 'danger' && (
                <div className="mt-2 p-2 bg-red-100 dark:bg-red-900/30 rounded text-xs text-red-700 dark:text-red-400">
                  ⚠️ This link may be malicious. Proceed with caution.
                </div>
              )}
              
              {previewData.status === 'warning' && (
                <div className="mt-2 p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded text-xs text-yellow-700 dark:text-yellow-400">
                  ⚠️ This link uses a URL shortener. The actual destination is hidden.
                </div>
              )}
            </>
          )}
        </div>
      )}
    </span>
  );
};

export default URLPreview;
