ARG BUILD_FROM=ghcr.io/home-assistant/base:3.24-2026.08.0
FROM node:20-alpine AS build
WORKDIR /build
COPY app/package*.json ./
RUN npm ci
COPY app/ ./
RUN npm run build

FROM ${BUILD_FROM}
RUN apk add --no-cache nginx
COPY --from=build /build/dist /www
COPY nginx.conf /etc/nginx/http.d/default.conf
COPY run.sh /run.sh
RUN chmod a+x /run.sh
CMD [ "/run.sh" ]
