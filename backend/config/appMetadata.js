const fs = require("fs");
const path = require("path");

const getAppVersion = () => {
  try {
    const packageJsonPath = path.join(__dirname, "..", "package.json");
    const packageData = fs.readFileSync(packageJsonPath, "utf8");
    return JSON.parse(packageData).version || "unknown";
  } catch (error) {
    return "unknown";
  }
};

const appVersion = getAppVersion();

module.exports = {
  appVersion,
};