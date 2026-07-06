# mcpscaffold — build + test in a slim Node image.
# Original Cognis Digital implementation.
FROM node:22-slim AS build
WORKDIR /app

# Install deps first for layer caching.
COPY package.json package-lock.json* ./
RUN npm ci || npm install

# Build and run the full test suite (fails the image build if tests fail).
COPY tsconfig.json tsconfig.test.json ./
COPY src ./src
COPY test ./test
COPY demos ./demos
RUN npm run build && npm run build:test && npm test

# Runtime layer: just the built library + CLI.
FROM node:22-slim AS runtime
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/demos ./demos
ENTRYPOINT ["node", "dist/cli.js"]
CMD ["--help"]
