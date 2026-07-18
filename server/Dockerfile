FROM node:20-alpine

WORKDIR /app
COPY package.json ./
COPY src ./src

RUN addgroup -S ratio && adduser -S ratio -G ratio \
  && mkdir -p /data \
  && chown -R ratio:ratio /app /data

# 兜底默认值：绕过 docker-compose 直接 docker run 时，数据也必须落在 /data 卷
# 而不是容器可写层（否则容器重建即丢全部用户备份），且必须监听 0.0.0.0 端口映射才可达。
ENV NODE_ENV=production \
  RATIO_DATA_DIR=/data \
  RATIO_HOST=0.0.0.0
VOLUME /data
EXPOSE 8787

USER ratio

CMD ["node", "src/server.js"]
