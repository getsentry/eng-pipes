# Use the official lightweight Node.js 12 image.
# https://hub.docker.com/_/node
FROM node:14-slim

# Create and change to the app directory.
WORKDIR /usr/src/app

# Copy application dependency manifests to the container image.
# Copying this separately prevents re-running npm install on every code change.
COPY package.json yarn.lock .yarnrc.yml .pnp.cjs ./
COPY .yarn ./.yarn

# Install git for commands that require us to inspect code contents
RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get install -y git

# Install production dependencies.
RUN yarn install --immutable

# Copy local code to the container image.
COPY . ./

RUN yarn build:production

RUN rm -rf src

# Run the web service on container startup.
CMD [ "yarn", "start" ]
