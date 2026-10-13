FROM node:22.22.0-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY dist ./dist
COPY worker ./worker
RUN cd worker && npm ci --omit=dev --ignore-scripts
RUN mkdir -p /data && chown node:node /data
USER node
ENV WORKER_CONFIG=/config/config.json
EXPOSE 5690
CMD ["node", "worker/server.cjs"]
