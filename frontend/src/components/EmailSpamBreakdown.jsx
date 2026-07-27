import React, { useState } from 'react';
import axios from 'axios';

export function EmailSpamBreakdown() {
  const [email, setEmail] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const analyze = async () => {
    if (!email) return;
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post('/api/email-breakdown', { email }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setData(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getColor = (score) => {
    if (score >= 70) return '#4CAF50';
    if (score >= 50) return '#FF9800';
    return '#f44336';
  };

  return (
    <div className="email-breakdown">
      <h3>📧 Email Spam Score Breakdown</h3>
      <div className="email-input">
        <input
          type="email"
          placeholder="Enter email..."
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button onClick={analyze} disabled={loading}>
          {loading ? '...' : 'Analyze'}
        </button>
      </div>

      {data && (
        <div className="breakdown">
          <div className="overall">
            Overall: <span style={{ color: getColor(data.overall) }}>{data.overall}%</span>
          </div>
          {['spf', 'dkim', 'dmarc', 'content'].map(key => (
            <div key={key} className="factor">
              <span>{key.toUpperCase()}</span>
              <div className="bar">
                <div className="fill" style={{ width: `${data[key].score}%`, background: getColor(data[key].score) }} />
              </div>
              <span>{data[key].score}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}