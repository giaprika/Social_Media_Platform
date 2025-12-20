FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
# Use npm install instead of npm ci since package-lock.json may not exist
RUN npm install --only=production && npm install axios

# Copy source code
COPY . .

# Expose port
EXPOSE 8004

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8004', (r) => {process.exit(r.statusCode ? 0 : 1)})"

# Start application
CMD ["node", "server.js"]

