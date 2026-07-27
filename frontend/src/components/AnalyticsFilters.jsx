import React, { useState } from 'react';

export function AnalyticsFilters({ onApply }) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const handleApply = () => {
    onApply({ startDate, endDate });
  };

  const handleReset = () => {
    setStartDate('');
    setEndDate('');
    onApply({ startDate: '', endDate: '' });
  };

  return (
    <div className="analytics-filters">
      <label>
        From:
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
      </label>
      <label>
        To:
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />
      </label>
      <button onClick={handleApply}>Apply</button>
      <button onClick={handleReset}>Reset</button>
    </div>
  );
}