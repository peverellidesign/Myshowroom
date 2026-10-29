FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=build /app/build ./build
COPY --from=build /app/dist ./dist
COPY server/schema.sql ./server/schema.sql
COPY server/import ./server/import
EXPOSE 3000
CMD ["node", "build/server.mjs"]
