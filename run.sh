#!/bin/bash

# Cleanup (Run upon ^C)
trap cleanup INT
function cleanup() {
	kill $BACKEND_PID
}

# Start Backend
# source env/bin/activate
FLASK_ENV=development flask run &
# Record Backend PID
export BACKEND_PID=$!

# Start Frontend
cd app && yarn start



