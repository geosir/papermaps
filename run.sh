#!/bin/bash

# Cleanup (Run upon ^C)
trap cleanup INT
function cleanup() {
  echo "Stopping backend..."
  kill $BACKEND_PID
  echo "Quit."
}

# Start Backend
# source env/bin/activate
flask --app app.py --debug run &
# Record Backend PID
export BACKEND_PID=$!

# Start Frontend
cd app && yarn start
