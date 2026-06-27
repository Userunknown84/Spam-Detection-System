const requiredEnvVars=[
    'PORT',
    'NODE_ENV',
    'MONGODB_URI',
    'JWT_SECRET',
    'API_URL',
    'INTERNAL_SECRET'
];
 
const validateEnv= () => {
    const missing = [];

    for(const envVar of requiredEnvVars){
        if(!process.env[envVar]){
            missing.push(envVar);
        }
    }

     if (missing.length > 0) {
        console.error('\n❌ Missing required environment variables:');
        missing.forEach(v => console.error(`   - ${v}`));
        console.error('\n💡 Please check your .env file\n');
        process.exit(1);
    }

    console.log('✅ All environment variables are set');
};

module.exports = validateEnv;