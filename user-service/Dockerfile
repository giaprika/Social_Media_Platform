FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
# Install dependencies
RUN npm ci --only=production && npm install axios amqplib

# Copy source code
COPY . .

# Expose port
EXPOSE 8001

# Health check - đơn giản check port có respond không
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8001', (r) => {process.exit(r.statusCode ? 0 : 1)})"

# Start application
CMD ["node", "server.js"]

