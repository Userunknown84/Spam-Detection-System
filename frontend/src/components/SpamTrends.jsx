import React, { useState, useEffect } from 'react';
import axios from 'axios';

export function SpamTrends() {
  const [data, setData] = useState([]);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTrends = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`/api/analytics/trends?days=${days}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setData(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchTrends();
  }, [days]);

  if (loading) return <div>Loading trends...</div>;
  if (!data.length) return <div>No data available</div>;

  return (
    <div className="spam-trends">
      <div className="trends-header">
        <h3>📈 Spam Trends</h3>
        <div className="trends-controls">
          <button onClick={() => setDays(7)}>7D</button>
          <button onClick={() => setDays(30)}>30D</button>
        </div>
      </div>
      
      <div className="trends-chart">
        {data.map((d, i) => (
          <div key={i} className="trend-bar">
            <span className="trend-label">{new Date(d.date).toLocaleDateString()}</span>
            <div className="bar-container">
              <div className="bar-spam" style={{ width: `${(d.spam / d.total) * 100}%` }}>
                {d.spam > 0 ? d.spam : ''}
              </div>
            </div>
            <span className="trend-total">{d.total}</span>
          </div>
        ))}
      </div>
    </div>
  );
}