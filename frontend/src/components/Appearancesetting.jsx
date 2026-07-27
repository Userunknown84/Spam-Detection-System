import React from 'react';

export function Appearancesetting() {
    const [theme,setTheme] = useState(localStorage.getItem('theme') || 'light');

    const toggleTheme= () => {
        const newTheme = theme == 'light'? 'dark' : 'light';
        setTheme(newTheme);
        localStorage.setItem('theme', newTheme);
        document.documentElement.className = newTheme;
    };

    return (
        <div className="settings-section">
      <h2>🎨 Appearance</h2>
      
      <div className="setting-item">
        <span>🌓 Dark Mode</span>
        <button onClick={toggleTheme}>
          {theme === 'light' ? '🌙 Enable Dark' : '☀️ Enable Light'}
        </button>
      </div>
    </div>
  );
}
  