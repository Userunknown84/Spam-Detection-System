import React, { useState } from 'react';
// import api from '../api';

const ActivityHeatmap = ({ userId, startDate, endDate }) => {
    const [activityData, setActivityData] = useState([]);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDay, setSelectedDay] = useState(null);
    const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    streak: 0,
    bestDay: 0,
    activeDays: 0
  });

  useEffect(() => {
    fetchActivityData();
  }, [currentMonth, userId]);

  const fetchActivityData = async () => {
    try {
        setLoading(true);
        const year = currentMonth.getFullYear();
      const month = currentMonth.getMonth() + 1;
      
      const response = await api.get(`/api/activity/${userId}?year=${year}&month=${month}`);
      setActivityData(response.data || {});
      calculateStats(response.data);
    } catch (error) {
        console.error('Error fetching activity data:', error);
        //Demo data in case of error
        generateDemoData();
    } finally {
        setLoading(false);
    }
};

const generateDemoData = () => {
    const data = {};
    const daysInMonth = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth() + 1,
      0
).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
        const  count = Math.floor(Math.random() * 10); // Random count between 0 and 9
        if(count > 0) {
            const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
            data[date.toISOString().split('T')[0]] = count;
        }
    }
    setActivityData(data);
    calculateStats(data);
};
const calculateStats = (data) => {
    const values = Object.values(data);
    const total = values.reduce((sum, v) => sum + v, 0);
    const activeDays = values.filter(v => v > 0).length;
    const bestDay = values.length > 0 ? Math.max(...values) : 0;
    
    // Calculate streak
    let streak = 0;
    const today = new Date();
    const currentDate = new Date(today);
    
    for (let i = 0; i < 365; i++) {
      const dateStr = currentDate.toISOString().split('T')[0];
      if (data[dateStr] > 0) {
        streak++;
      } else {
        break;
      }
      currentDate.setDate(currentDate.getDate() - 1);
    }
    
    setStats({ total, streak, bestDay, activeDays });
  };

  const getIntensity = (count) => {
    if (count === 0) return 0;
    if (count <= 2) return 1;
    if (count <= 5) return 2;
    if (count <= 8) return 3;
    return 4;
  };

  const getColor = (intensity) => {
    const colors = [
      'bg-slate-100 dark:bg-slate-800',
      'bg-green-200 dark:bg-green-900/40',
      'bg-green-400 dark:bg-green-700',
      'bg-green-600 dark:bg-green-500',
      'bg-green-800 dark:bg-green-300'
    ];
    return colors[intensity] || colors[0];
  };

  const getTextColor = (intensity) => {
    return intensity > 2 ? 'text-white' : 'text-slate-700 dark:text-slate-300';
  };

  const changeMonth = (delta) => {
    const newMonth = new Date(currentMonth);
    newMonth.setMonth(newMonth.getMonth() + delta);
    setCurrentMonth(newMonth);
    setSelectedDay(null);
  };

  const handleDayClick = (day) => {
    const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setSelectedDay({ day, count: activityData[dateStr] || 0, date: dateStr });
  };

  const daysInMonth = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth() + 1,
    0
  ).getDate();

  const firstDayOfMonth = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth(),
    1
  ).getDay();

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                      'July', 'August', 'September', 'October', 'November', 'December'];

  return (
    <div className={`p-6 rounded-xl border ${darkMode ? 'bg-slate-900/50 border-slate-700' : 'bg-white/70 border-slate-200'}`}>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold">📊 Activity Heatmap</h3>
        <div className="flex items-center gap-4">
          <button
            onClick={() => changeMonth(-1)}
            className={`px-2 py-1 rounded transition ${darkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-100'}`}
          >
            ◀
          </button>
          <span className="font-semibold">{monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}</span>
          <button
            onClick={() => changeMonth(1)}
            className={`px-2 py-1 rounded transition ${darkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-100'}`}
          >
            ▶
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            <div className={`p-3 rounded-lg text-center ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-xs opacity-60">Total</div>
            </div>
            <div className={`p-3 rounded-lg text-center ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
              <div className="text-2xl font-bold">🔥 {stats.streak}</div>
              <div className="text-xs opacity-60">Streak</div>
            </div>
            <div className={`p-3 rounded-lg text-center ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
              <div className="text-2xl font-bold">{stats.activeDays}</div>
              <div className="text-xs opacity-60">Active Days</div>
            </div>
            <div className={`p-3 rounded-lg text-center ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
              <div className="text-2xl font-bold">{stats.bestDay}</div>
              <div className="text-xs opacity-60">Best Day</div>
            </div>
          </div>

          {/* Heatmap Grid */}
          <div className="grid grid-cols-7 gap-1">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
              <div key={index} className="text-center text-xs font-semibold opacity-60 py-1">
                {day}
              </div>
            ))}
            
            {Array.from({ length: firstDayOfMonth }).map((_, index) => (
              <div key={`empty-${index}`} className="aspect-square" />
            ))}
            
            {Array.from({ length: daysInMonth }).map((_, index) => {
              const day = index + 1;
              const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const count = activityData[dateStr] || 0;
              const intensity = getIntensity(count);
              const isToday = new Date().toISOString().split('T')[0] === dateStr;
              
              return (
                <button
                  key={day}
                  onClick={() => handleDayClick(day)}
                  className={`aspect-square rounded text-xs font-medium transition hover:scale-110 ${getColor(intensity)} ${getTextColor(intensity)} ${isToday ? 'ring-2 ring-blue-500' : ''} ${selectedDay?.day === day ? 'ring-2 ring-yellow-500' : ''}`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center gap-2 mt-3 text-xs">
            <span className="opacity-60">Less</span>
            {[0, 1, 2, 3, 4].map((level) => (
              <div key={level} className={`w-4 h-4 rounded ${getColor(level)}`} />
            ))}
            <span className="opacity-60">More</span>
          </div>

          {/* Selected Day Details */}
          {selectedDay && (
            <div className={`mt-4 p-3 rounded-lg ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
              <div className="flex justify-between items-center">
                <span className="font-semibold">
                  📅 {selectedDay.date}
                </span>
                <span className="text-lg font-bold">
                  {selectedDay.count} predictions
                </span>
              </div>
              <div className="text-sm opacity-60 mt-1">
                {selectedDay.count > 0 ? '🔥 Active day' : '😴 No activity'}
              </div>
            </div>
          )}
        </>
      )}
    </div>
    );
};

export default ActivityHeatmap;
