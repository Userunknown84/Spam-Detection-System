const {REQUIRED_ENV_VARS} = require("../config/envConstants")

// Shared secret authenticating Node→Flask calls must be long enough that it
// can't be guessed; a default baked into source would be public and useless.
const INTERNAL_SECRET_MIN_LENGTH = 32;

const validateEnv= () => {
    const missing = [];

    for(const envVar of REQUIRED_ENV_VARS){
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

    if (process.env.INTERNAL_SECRET.length < INTERNAL_SECRET_MIN_LENGTH) {
        console.error('\n❌ INTERNAL_SECRET is too short:');
        console.error(`   - it is ${process.env.INTERNAL_SECRET.length} characters; at least ${INTERNAL_SECRET_MIN_LENGTH} are required`);
        console.error('\n💡 Generate a strong value with:');
        console.error('   node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64url\'))"');
        console.error('   Set the SAME value for the Node and Flask services.\n');
        process.exit(1);
    }

    console.log('✅ All environment variables are set');
};

module.exports = validateEnv;