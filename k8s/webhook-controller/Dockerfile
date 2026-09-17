FROM node:20-slim

ENV NODE_ENV=production

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY index.js ./

EXPOSE 9321

CMD ["node", "index.js"]
