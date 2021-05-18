# syntax=docker/dockerfile:1
FROM ubuntu:18.04

# Get papermaps
COPY . /papermaps

# Set up dependencies
RUN apt-get update
RUN apt-get install -y nginx python3 python3-pip nodejs curl npm
# RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.38.0/install.sh | bash
# RUN source /etc/bashrc && nvm install node

# Install papermaps
WORKDIR /papermaps
RUN python3 -m pip install -r requirements.txt
RUN npm install -g yarn
# RUN nvm use node && cd app && yarn install
RUN cd app && yarn install
RUN cd app && make
RUN cp papermaps.conf /etc/nginx/sites-available
RUN ln -s /etc/nginx/sites-available/papermaps.conf /etc/nginx/sites-enabled/papermaps.conf

# Run
CMD ["python3", "app.py"]
