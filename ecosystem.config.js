module.exports = {
  apps: [
    { name: "gateway", cwd: "./backend-gateway", script: "node", args: "src/index.js" },
    { name: "user-service", cwd: "./user-service", script: "node", args: "server.js" },
    { name: "notification-service", cwd: "./notification-service", script: "node", args: "server.js" },
    { name: "ai-service", cwd: "./ai-service", script: "cmd", args: "/c adk api_server --host 0.0.0.0 --port 9000", interpreter: "none" },
    { name: "post-service", cwd: "./post-service", script: "uvicorn", args: "app:app --host 0.0.0.0 --port 8003" }
  ]
};