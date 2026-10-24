# syntax=docker/dockerfile:1
FROM node:22-alpine

WORKDIR /app
COPY package*.json ./
# npm download cache is preserved between builds via BuildKit cache mount.
RUN --mount=type=cache,target=/root/.npm \
    npm install --no-audit --no-fund
COPY . .

EXPOSE 5173
# Vite dev server; --host 0.0.0.0 makes it reachable through the published port.
# VITE_API_BASE_URL is read from the container environment when the server starts.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
