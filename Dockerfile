FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY .npmrc ./

RUN npm ci --only=production

COPY . .

EXPOSE 10000

CMD ["node", "server.js"]
