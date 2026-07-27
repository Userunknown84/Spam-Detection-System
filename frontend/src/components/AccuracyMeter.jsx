import React, { useState, useEffect } from 'react';
import axios from 'axios';

export function AccuracyMeter() {
  const [data, setData] = useState({ accuracy: 0, total: 0, correct: 0, incorrect: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAccuracy = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get('/api/analytics/accuracy', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setData(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchAccuracy();
  }, []);

  if (loading) return <div className="accuracy-loading">Loading accuracy...</div>;
  if (!data.total) return <div className="accuracy-empty">No feedback data yet</div>;

  const color = data.accuracy >= 80 ? '#4CAF50' : data.accuracy >= 60 ? '#FF9800' : '#f44336';

  return (
    <div className="accuracy-meter">
      <div className="accuracy-header">
        <h3>🎯 Model Accuracy</h3>
        <span className="accuracy-percent" style={{ color }}>{data.accuracy}%</span>
      </div>
      
      <div className="accuracy-bar">
        <div 
          className="accuracy-fill" 
          style={{ width: `${data.accuracy}%`, background: color }}
        />
      </div>
      
      <div className="accuracy-stats">
        <span>✅ Correct: {data.correct}</span>
        <span>❌ Incorrect: {data.incorrect}</span>
        <span>📊 Total: {data.total}</span>
      </div>
    </div>
  );
}