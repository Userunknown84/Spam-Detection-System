module.exports = {
    port: 3000,
    logLevel: 'debug',
    corsOrigins: ['http://localhost:5173', 'http://localhost:3000'],
    mongodbUri: process.env.MONGODB_URI,
    rateLimit: {
        windowsMs : 60000,
        max : 100
    },
    jwtSecret: process.env.JWT_SECRET 
};