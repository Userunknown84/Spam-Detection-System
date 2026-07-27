import React, { useState } from 'react';
import axios from 'axios';

export function ResultBadge({ prediction, confidence, text }) {
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);

  const handleReport = async () => {
    setReporting(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/feedback/false-positive', {
        text,
        predicted_label: prediction,
        correct_label: 'ham'
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setReported(true);
    } catch (err) {
      console.error(err);
    } finally {
      setReporting(false);
    }
  };

  const getColor = () => {
    const colors = {
      spam: '#f44336',
      ham: '#4CAF50',
      smishing: '#FF9800',
      offensive: '#9C27B0',
      safe: '#4CAF50',
      malicious: '#f44336'
    };
    return colors[prediction?.toLowerCase()] || '#757575';
  };

  return (
    <div className="result-badge-container">
      <div className="result-badge" style={{ backgroundColor: getColor(), color: 'white', padding: '4px 12px', borderRadius: '20px', display: 'inline-block' }}>
        {prediction} {confidence && `(${Math.round(confidence)}%)`}
      </div>
      
      {prediction !== 'ham' && prediction !== 'safe' && !reported && (
        <button className="report-btn" onClick={handleReport} disabled={reporting}>
          {reporting ? '⏳ Reporting...' : '🚫 Report False Positive'}
        </button>
      )}
      
      {reported && <span className="report-success">✅ Thanks! Feedback recorded</span>}
    </div>
  );
}