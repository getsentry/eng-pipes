# Use the official lightweight Node.js 12 image.
# https://hub.docker.com/_/node
FROM node:18.17.1-bookworm-slim

# Create and change to the app directory.
WORKDIR /usr/src/app

# Enable Corepack so the pinned pnpm version from package.json is used.
RUN corepack enable

# Copy application dependency manifests to the container image.
# Copying this separately prevents re-running install on every code change.
COPY package.json pnpm-lock.yaml .npmrc ./

# Install dependencies (exact, reproducible install from the lockfile).
RUN pnpm install --frozen-lockfile

# Copy local code to the container image.
COPY . ./

RUN pnpm build:production

RUN rm -rf src

# Run the web service on container startup.
CMD [ "pnpm", "start" ]
