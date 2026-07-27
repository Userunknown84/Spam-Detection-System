import React, { useState, useEffect } from 'react';
import axios from 'axios';

export function RecentActivity() {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRecent = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get('/api/history/recent', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setActivities(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchRecent();
  }, []);

  if (loading) return <div className="recent-loading">Loading...</div>;
  if (!activities.length) return <div className="recent-empty">No recent activity</div>;

  return (
    <div className="recent-activity">
      <h3>📋 Recent Activity</h3>
      <div className="activity-list">
        {activities.map((item, i) => (
          <div key={i} className="activity-item">
            <span className="activity-text">{item.text?.substring(0, 30)}...</span>
            <span className={`activity-result ${item.result}`}>{item.result}</span>
            <span className="activity-time">
              {new Date(item.createdAt).toLocaleTimeString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}