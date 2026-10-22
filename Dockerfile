FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY main.js Roboto-Bold.ttf owoInfo.json coinFlipGifs.json ./
ENV PORT=8080
EXPOSE 8080
USER node
CMD ["node", "main.js"]
