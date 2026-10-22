FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:stable-alpine
COPY --from=build /app/dist/vulcano/browser /usr/share/nginx/html
COPY deploy/default.conf.template /etc/nginx/templates/default.conf.template
EXPOSE 80
