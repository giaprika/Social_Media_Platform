module.exports = {
  apps: [
    { name: "gateway", cwd: "./backend-gateway", script: "node", args: "src/index.js" },
    { name: "user-service", cwd: "./user-service", script: "node", args: "server.js" },
    { name: "notification-service", cwd: "./notification-service", script: "node", args: "server.js" },
  ]
};