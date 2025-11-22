#!/bin/bash
# Bash script to serve Swagger UI

echo "Starting Swagger UI server..."
echo "Open your browser at: http://localhost:8081"
echo "Press Ctrl+C to stop the server"
echo ""

# Check if Python is available
if command -v python3 &> /dev/null; then
    python3 -m http.server 8081
elif command -v python &> /dev/null; then
    python -m http.server 8081
else
    echo "Error: Python is not installed or not in PATH"
    echo "Please install Python or use another HTTP server"
    exit 1
fi
