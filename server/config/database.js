/**
 * ConnectX Database Connection Manager
 * Manages resilient MongoDB connection lifecycle with reconnect hooks and graceful shutdown.
 */
const mongoose = require("mongoose");
const config = require("./env");

async function connectDatabase() {
  try {
    const conn = await mongoose.connect(config.mongoUrl, {
      maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE) || 50,
      minPoolSize: Number(process.env.MONGO_MIN_POOL_SIZE) || 5,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  } catch (err) {
    console.error(`❌ MongoDB Connection Failed: ${err.message}`);
    process.exit(1);
  }
}

mongoose.connection.on("disconnected", () => {
  console.warn("⚠️ MongoDB Disconnected. Attempting reconnection...");
});

mongoose.connection.on("reconnected", () => {
  console.log("🔄 MongoDB Reconnected.");
});

mongoose.connection.on("error", (err) => {
  console.error(`❌ MongoDB Runtime Error: ${err.message}`);
});

function isDatabaseConnected() {
  return mongoose.connection.readyState === 1;
}

/**
 * Ensures all registered model indexes are built reliably on the MongoDB cluster.
 * Critical for production environments where autoIndex is disabled.
 */
async function ensureAllIndexes() {
  const User = require("../models/userModel");
  const SessionFamily = require("../models/sessionFamilyModel");
  const ActiveRotations = require("../models/activeRotationsModel");
  const RefreshSession = require("../models/refreshSessionModel");
  const Counter = require("../models/counterModel");
  const Message = require("../models/messageModel");

  const models = [User, SessionFamily, ActiveRotations, RefreshSession, Counter, Message];
  const results = {};

  for (const model of models) {
    if (model && typeof model.createIndexes === "function") {
      try {
        await model.createIndexes();
        results[model.modelName] = "synced";
      } catch (err) {
        console.error(`Failed to sync indexes for ${model.modelName}:`, err.message);
        results[model.modelName] = `error: ${err.message}`;
      }
    }
  }
  return results;
}

module.exports = {
  connectDatabase,
  isDatabaseConnected,
  ensureAllIndexes,
};
