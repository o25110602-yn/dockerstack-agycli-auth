FROM node:20-slim

# Install minimal deps
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates bash expect \
    && rm -rf /var/lib/apt/lists/*

# Install Antigravity CLI (agy)
# NOTE: install.sh sets up `agy` binary at /usr/local/bin/agy
RUN curl -fsSL https://antigravity.google/cli/install.sh | bash || true

# Copy exec-wrapper.sh which auto-selects Google OAuth from agy interactive menu
COPY exec-wrapper.sh /exec-wrapper.sh
RUN chmod +x /exec-wrapper.sh

# Persistent credentials live here (mounted as volume by docker-compose)
RUN mkdir -p /root/.gemini/antigravity-cli

WORKDIR /app

# Keep container alive (stdin_open + tty are set in docker-compose)
CMD ["tail", "-f", "/dev/null"]
