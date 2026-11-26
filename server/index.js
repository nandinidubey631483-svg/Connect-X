/**
 * ConnectX Server Entrypoint
 * Loads validated configuration, establishes database connection, and boots HTTP + WebSockets.
 */
const http = require("http");
const app = require("./app");
const config = require("./config/env");
const { connectDatabase } = require("./config/database");
const { initSocketGateway } = require("./realtime/socketGateway");

async function startServer() {
  // 1. Establish resilient Database Connection
  await connectDatabase();

  // 2. Create HTTP Server wrapping Express app
  const server = http.createServer(app);

  // 3. Initialize Socket.IO Gateway
  initSocketGateway(server);

  // 4. Start Listening on Configured Port
  server.listen(config.port, () => {
    console.log(`🚀 ConnectX Server listening on port ${config.port} (${config.nodeEnv})`);
    console.log(`🩺 Health check accessible at http://localhost:${config.port}/health`);
  });

  // Graceful shutdown handling
  const shutdown = () => {
    console.log("🛑 Gracefully shutting down ConnectX server...");
    server.close(() => {
      console.log("👋 HTTP server closed.");
      process.exit(0);
    });
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

startServer().catch((err) => {
  console.error("❌ Fatal Error during server bootstrap:", err);
  process.exit(1);
});
