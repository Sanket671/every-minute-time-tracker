require("dotenv").config();

const config = {
  port: Number(process.env.PORT || 5000),
  mongoUri: process.env.MONGODB_URI || "",
  dayStart: process.env.DAY_START || "08:00",
  dayEnd: process.env.DAY_END || "20:00",
  timezone: process.env.TIMEZONE || "Asia/Kolkata",
  appAccessKey: process.env.APP_ACCESS_KEY || "",
  nodeEnv: process.env.NODE_ENV || "development",
};

module.exports = config;
