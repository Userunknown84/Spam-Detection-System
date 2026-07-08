import React from 'react';

const Footer = ({ darkMode }) => {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className={`w-full py-4 px-6 text-center text-sm border-t ${
      darkMode ? 'border-slate-800 text-slate-400' : 'border-slate-200 text-slate-600'
    }`}>
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-2">
        <div className="flex items-center gap-2">
          <span>🛡️</span>
          <span>Spam Detection System</span>
        </div>
        <p className="opacity-60">© {currentYear} All rights reserved</p>
        <div className="flex gap-4 text-xs">
          <a href="#" className="hover:underline opacity-60 hover:opacity-100 transition-opacity">Privacy</a>
          <a href="#" className="hover:underline opacity-60 hover:opacity-100 transition-opacity">Terms</a>
          <a href="#" className="hover:underline opacity-60 hover:opacity-100 transition-opacity">Contact</a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
