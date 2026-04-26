FROM node:20-alpine

WORKDIR /app
COPY package.json ./
COPY src ./src

RUN addgroup -S ratio && adduser -S ratio -G ratio \
  && mkdir -p /data \
  && chown -R ratio:ratio /app /data

ENV NODE_ENV=production
EXPOSE 8787

USER ratio

CMD ["node", "src/server.js"]
