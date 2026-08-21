FROM node:24-bookworm-slim AS deps
WORKDIR /app

COPY package*.json ./
RUN npm ci


FROM deps AS build
COPY . .
RUN npm run build


FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/tsconfig.json ./tsconfig.json

EXPOSE 5174

CMD ["npm", "run", "start"]

