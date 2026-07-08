module.exports = {
    port: 3001,
    logLevel: 'silent',
    corsOrigins: ['*'],
    mongodbUri: '',
    rateLimit: {
        windowMs: 60000,
        max: 1000
    },
    jwtSecret: 'test-secret-key'
};