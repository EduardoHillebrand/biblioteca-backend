FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p /app/storage/books /app/storage/covers
EXPOSE 4000
CMD ["npm","start"]
