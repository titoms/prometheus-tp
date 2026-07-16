FROM node:18-alpine

WORKDIR /app

# Copier les fichiers de dépendances en premier pour profiter du cache Docker
COPY package*.json ./
RUN npm install --production

COPY server.js .

EXPOSE 3001

CMD ["node", "server.js"]
