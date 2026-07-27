import React, { useState } from 'react';
import './Settings.css';

export function Settings(){
    const[activeTab, setActiveTab] = useState('profile');

    const tabs = [
    { id: 'profile', label: '👤 Profile', icon: '👤' },
    { id: 'security', label: '🛡 Security', icon: '🛡' },
    { id: 'appearance', label: '🎨 Appearance', icon: '🎨' },
    { id: 'privacy', label: '🔐 Privacy', icon: '🔐' },
    { id: 'about', label: 'ℹ️ About', icon: 'ℹ️' },
  ];

  return (
    <div className="settings-page">
      <div className="settings-container">
        {/* Sidebar */}
        <div className="settings-sidebar">
          <div className="settings-user">
            <img src="/default-avatar.png" alt="Avatar" className="settings-avatar" />
            <h3>User</h3>
            <p>user@email.com</p>
          </div>
          <nav className="settings-nav">
            {tabs.map(tab => (
              <button
                key={tab.id}
                className={`settings-nav-item ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
          <button className="settings-logout">🚪 Logout</button>
          <button className="settings-delete">❌ Delete Account</button>
        </div>

        {/* Content */}
        <div className="settings-content">
          {activeTab === 'profile' && <ProfileSettings />}
          {activeTab === 'appearance' && <AppearanceSettings />}
          {activeTab === 'security' && <SecuritySettings />}
          {activeTab === 'privacy' && <PrivacySettings />}
          {activeTab === 'about' && <AboutSettings />}
        </div>
      </div>
    </div>
  );
}