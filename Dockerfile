# syntax=docker/dockerfile:1
FROM ubuntu:18.04

# Get papermaps
COPY . /papermaps

# Set up dependencies
RUN apt-get update
RUN apt-get install -y nginx python3 python3-pip nodejs curl npm

# Install papermaps
WORKDIR /papermaps
RUN python3 -m pip install -r requirements.txt
RUN npm install -g yarn
# TODO: Use latest node engine version instead of ignoring engines!
RUN cd app && yarn install --ignore-engines
# Uncomment for production; only need to do this for production build
RUN cd app && make
RUN cp papermaps.conf /etc/nginx/sites-available/papermaps.conf
RUN ln -s /etc/nginx/sites-available/papermaps.conf /etc/nginx/sites-enabled/papermaps.conf

# Run
CMD ./docker_entry.sh
