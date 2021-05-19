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
RUN cd app && make
RUN cp papermaps.conf /etc/nginx/sites-available
RUN ln -s /etc/nginx/sites-available/papermaps.conf /etc/nginx/sites-enabled/papermaps.conf

# Run
CMD ["python3", "app.py"]
