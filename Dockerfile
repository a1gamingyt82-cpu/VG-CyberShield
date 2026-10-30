FROM node:20-bookworm-slim

# Install system dependencies including FFmpeg for audio streaming
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    ca-certificates \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Hugging Face Spaces mandates non-root user UID 1000
RUN useradd -m -u 1000 user
WORKDIR /app

# Grant permissions
RUN chown -R user:user /app

# Copy dependency files first
COPY --chown=user:user package*.json ./

USER user
RUN npm install --omit=dev

# Copy application files
COPY --chown=user:user . .

ENV PORT=7860 \
    NODE_ENV=production \
    HOME=/home/user

EXPOSE 7860

CMD ["node", "server.js"]
