FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --production

COPY . .

RUN mkdir -p /data

EXPOSE 3000

CMD ["node", "--no-warnings", "server.js"]
