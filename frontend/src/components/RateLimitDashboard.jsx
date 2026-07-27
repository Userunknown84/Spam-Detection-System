import React, { useState, useEffect } from 'react';
import axios from 'axios';

export function RateLimitDashboard() {
  const [data, setData] = useState({ limit: 100, used: 0, remaining: 100, percentage: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRateLimit = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get('/api/analytics/rate-limit', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setData(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchRateLimit();
  }, []);

  if (loading) return <div className="rate-loading">Loading...</div>;

  const color = data.percentage > 80 ? '#f44336' : data.percentage > 60 ? '#FF9800' : '#4CAF50';

  return (
    <div className="rate-limit-dashboard">
      <h3>📊 API Rate Limit</h3>
      <div className="rate-stats">
        <div className="rate-item">
          <span className="rate-label">Used</span>
          <span className="rate-value">{data.used}</span>
        </div>
        <div className="rate-item">
          <span className="rate-label">Remaining</span>
          <span className="rate-value" style={{ color }}>{data.remaining}</span>
        </div>
        <div className="rate-item">
          <span className="rate-label">Limit</span>
          <span className="rate-value">{data.limit}</span>
        </div>
      </div>
      <div className="rate-bar">
        <div className="rate-fill" style={{ width: `${data.percentage}%`, background: color }} />
      </div>
      <div className="rate-reset">
        Resets at: {new Date(data.reset).toLocaleTimeString()}
      </div>
    </div>
  );
}