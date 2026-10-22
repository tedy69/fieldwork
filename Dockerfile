FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json tsconfig.json ./
COPY apps ./apps
COPY packages ./packages
RUN npm ci
RUN npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001 DATABASE_PATH=/app/data/fieldwork.sqlite
COPY package*.json ./
COPY apps/api ./apps/api
COPY packages/contracts ./packages/contracts
RUN npm ci --omit=dev --workspace @fieldwork/api --include-workspace-root && npm cache clean --force
COPY --from=build /app/apps/web/dist ./apps/web/dist
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3001
CMD ["node", "--import", "tsx", "apps/api/src/main.ts"]
