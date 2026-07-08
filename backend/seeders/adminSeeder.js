const User = require("../models/User");

const seedAdminUser = async () => {
  try {
    const email = process.env.ADMIN_EMAIL || "admin@example.com";
    const password = process.env.ADMIN_PASSWORD || "admin123";

    const adminExists = await User.findOne({
      $or: [
        { role: "admin" },
        { username: "admin" },
        { email: email },
      ],
    });

    if (!adminExists) {
      await User.create({
        username: "admin",
        name: "Admin",
        email: email,
        password: password,
        role: "admin",
      });

      console.log("Admin user created successfully");
      console.log(`Email: ${email}`);
      console.log(`Password: ${password}`);
    } else {
      console.log("Admin user already exists. Skipping seed.");
    }
  } catch (error) {
    console.error("Error seeding admin user:", error.message);
  }
};

module.exports = seedAdminUser;