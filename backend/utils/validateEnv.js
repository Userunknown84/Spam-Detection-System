const {REQUIRED_ENV_VARS} = require("../config/envConstants")

// Shared secret authenticating Node→Flask calls must be long enough that it
// can't be guessed; a default baked into source would be public and useless.
const INTERNAL_SECRET_MIN_LENGTH = 32;

const validateEnv= () => {
    const missing = [];
    const invalid = [];

    for(const envVar of REQUIRED_ENV_VARS){
<<<<<<< Updated upstream
        if(!process.env[envVar] || process.env[envVar].trim() === ''){
=======
        if(!process.env[envVar]){
>>>>>>> Stashed changes
            missing.push(envVar);
        }
    }

    if (missing.length > 0) {
        console.error('\n❌ Missing or empty required environment variables:');
        missing.forEach(v => console.error(`   - ${v}`));
    }

    // Configuration validations
    if (!missing.includes('MONGODB_URI')) {
        if (!process.env.MONGODB_URI.startsWith('mongodb://') && !process.env.MONGODB_URI.startsWith('mongodb+srv://')) {
            invalid.push({ key: 'MONGODB_URI', reason: 'Must start with mongodb:// or mongodb+srv://' });
        }
    }

    if (!missing.includes('INTERNAL_SECRET')) {
        if (process.env.INTERNAL_SECRET.length < INTERNAL_SECRET_MIN_LENGTH) {
            invalid.push({ key: 'INTERNAL_SECRET', reason: `Must be at least ${INTERNAL_SECRET_MIN_LENGTH} characters long` });
        }
    }

    if (missing.length > 0 || invalid.length > 0) {
        if (invalid.length > 0) {
            console.error('\n❌ Invalid environment variables:');
            invalid.forEach(v => console.error(`   - ${v.key}: ${v.reason}`));
        }
        console.error('\n💡 Please correct your .env file\n');
        process.exit(1);
    }

    console.log('✅ All environment variables are set and valid');
};

module.exports = validateEnv;