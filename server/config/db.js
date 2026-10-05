const mongoose = require("mongoose");
const config = require("./config");

let dbStatus = "disconnected";

async function connectDatabase() {
  if (!config.mongoUri) {
    dbStatus = "not-configured";
    return { connected: false, status: dbStatus, mode: "memory-fallback" };
  }

  if (mongoose.connection.readyState === 1) {
    dbStatus = "connected";
    return { connected: true, status: dbStatus, mode: "mongodb" };
  }

  try {
    await mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: 5000,
      autoIndex: true,
    });
    dbStatus = "connected";
    return { connected: true, status: dbStatus, mode: "mongodb" };
  } catch (error) {
    dbStatus = "error";
    return {
      connected: false,
      status: "error",
      mode: "mongodb",
      message: "MongoDB connection failed.",
    };
  }
}

function getDbStatus() {
  if (!config.mongoUri) {
    return {
      connected: false,
      status: "not-configured",
      mode: "memory-fallback",
    };
  }

  if (mongoose.connection.readyState === 1) {
    return { connected: true, status: "connected", mode: "mongodb" };
  }

  return {
    connected: false,
    status: dbStatus || "disconnected",
    mode: "mongodb",
  };
}

module.exports = { connectDatabase, getDbStatus };
