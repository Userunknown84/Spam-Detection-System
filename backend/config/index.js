const development = require('./development');
const production = require('./production');
const test = require('./test');

const config = {
  development,
  production,
  test,
};

const env = process.env.NODE_ENV || 'development';

module.exports = config[env] || config.development;