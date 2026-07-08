const bcrypt = require('bcryptjs');

describe('Authentication Utilities & Password Hashing', () => {
  
  it('should hash a password correctly and securely', async () => {
    const plainTextPassword = 'mySuperSecretPassword123!';
    const saltRounds = 10;
    
    // 1. Hash the password
    const hashedPassword = await bcrypt.hash(plainTextPassword, saltRounds);
    
    // The hash should exist and not equal the plain text
    expect(hashedPassword).toBeDefined();
    expect(hashedPassword).not.toBe(plainTextPassword);
    
    // 2. Verify the hash matches the original password
    const isMatch = await bcrypt.compare(plainTextPassword, hashedPassword);
    expect(isMatch).toBe(true);
  });

  it('should reject incorrect passwords during comparison', async () => {
    const plainTextPassword = 'mySuperSecretPassword123!';
    const wrongPassword = 'wrongPassword456';
    const hashedPassword = await bcrypt.hash(plainTextPassword, 10);
    
    // Verify that comparing a wrong password returns false
    const isMatch = await bcrypt.compare(wrongPassword, hashedPassword);
    expect(isMatch).toBe(false);
  });
});