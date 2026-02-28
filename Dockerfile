FROM node:18-alpine

# Install curl for healthcheck
RUN apk add --no-cache curl

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Ensure exports directory exists
RUN mkdir -p /app/exports

EXPOSE 8080

CMD ["npm", "start"]
