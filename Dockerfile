FROM node:20-bullseye-slim

# Install system dependencies & Python for multi-language bot hosting
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    ca-certificates \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Link python3 to python
RUN ln -s /usr/bin/python3 /usr/bin/python

WORKDIR /app

# Copy application files
COPY package.json .
COPY server.js .
COPY supervisor.js .
COPY securitySandbox.js .
COPY public/ public/

# Expose Web Dashboard Port
EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production
ENV UNLIMITED_HARDWARE_PASSTHROUGH=1

# Run the 24/7 Bot Hosting Supervisor
CMD ["node", "server.js"]

