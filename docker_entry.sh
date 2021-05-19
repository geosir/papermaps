#!/bin/bash

# Start API Server
# TODO: When deploying to production, run app.py using a uWSGI service.
LC_ALL=C.UTF-8 LANG=C.UTF-8 FLASK_ENV=development flask run &

# Start development react server
# Comment this out when running in production.
# cd app && yarn start &

# Start NGINX
nginx -g 'daemon off;'
