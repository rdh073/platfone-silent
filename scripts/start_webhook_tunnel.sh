#!/bin/bash
set -e

# Default Configuration
LOCAL_PORT=3000
REMOTE_PORT=${1:-30001} # First argument or default to 30001
REMOTE_USER="user"
REMOTE_HOST="server185"

echo "------------------------------------------------"
echo "🔌 Starting Webhook Tunnel Infrastructure"
echo "------------------------------------------------"
echo "Local Port:  $LOCAL_PORT"
echo "Remote Port: $REMOTE_PORT (Publicly accessible on $REMOTE_HOST)"
echo "Target:      $REMOTE_USER@$REMOTE_HOST"
echo "------------------------------------------------"

# 1. Start Webhook Server in background
echo "🚀 Starting Node.js Webhook Server..."
# Using npx ts-node to run directly. Output redirected to keep terminal clean-ish, 
# or you can rely on the user running this in a separate tab.
# We'll run it in the background and trap exit signals to kill it.
npx ts-node src/webhook_server.ts &
SERVER_PID=$!

# Function to cleanup background process on exit
cleanup() {
    echo "🛑 Shutting down server (PID $SERVER_PID)..."
    kill $SERVER_PID
}
trap cleanup EXIT

# Wait a moment for server to boot
sleep 3

# 2. Establish SSH Reverse Tunnel
echo "🔗 Establishing SSH Reverse Tunnel..."
echo "👉 Command: ssh -R $REMOTE_PORT:localhost:$LOCAL_PORT $REMOTE_USER@$REMOTE_HOST -N"
echo ""
echo "!!! YOU MAY BE PROMPTED FOR PASSWORD/KEY !!!"
echo ""

# -N means "do not execute a remote command", just forward ports.
ssh -R $REMOTE_PORT:localhost:$LOCAL_PORT $REMOTE_USER@$REMOTE_HOST -N
