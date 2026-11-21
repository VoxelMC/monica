# orbit: SvelteKit (adapter-node). Built by the owner on the server:
#   docker compose up -d --build orbit
# Runtime config comes from the compose file / orbit.env, never from this image.

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN npm install -g pnpm@12.21.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && pnpm prune --prod

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=127.0.0.1 PORT=3000
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
# Drizzle migrations for the extension DB, applied on first use
COPY --from=build /app/drizzle ./drizzle
# The extension DB lives on the /data volume (backed up nightly by backup.sh)
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
CMD ["node", "build"]
