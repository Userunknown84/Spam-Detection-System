// utils/logger.js
const fs = require('fs');
const path = require('path');

// Logs directory create karein
const logDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logFile = path.join(logDir, 'app.log');

// File mein log likhne ka function
const writeToFile = (level, message) => {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${level.toUpperCase()}] : ${message}\n`;
  fs.appendFile(logFile, logEntry, (err) => {
    if (err) {
      console.error('Error writing to log file:', err);
    }
  });
};

// Custom Logger Object
const logger = {
  info: (message, ...args) => {
    const msg = typeof message === 'string' ? message : JSON.stringify(message);
    writeToFile('info', msg);
    console.log(message, ...args); // ✅ Maintainer ki demand: Console bhi print karega!
  },
  error: (message, ...args) => {
    const msg = typeof message === 'string' ? message : JSON.stringify(message);
    writeToFile('error', msg);
    console.error(message, ...args); // ✅ Maintainer ki demand: Console bhi print karega!
  },
  warn: (message, ...args) => {
    const msg = typeof message === 'string' ? message : JSON.stringify(message);
    writeToFile('warn', msg);
    console.warn(message, ...args); // ✅ Maintainer ki demand: Console bhi print karega!
  },
  debug: (message, ...args) => {
    const msg = typeof message === 'string' ? message : JSON.stringify(message);
    writeToFile('debug', msg);
    console.debug(message, ...args); // ✅ Maintainer ki demand: Console bhi print karega!
  }
};

module.exports = logger;