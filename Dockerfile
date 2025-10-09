# build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build   # gera dist/

# run
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
# somente o necessário para rodar
COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist

# se você precisa de arquivos estáticos (ex: schemas), copie-os também
# COPY --from=builder /app/public ./public

# garante diretórios de storage dentro do container
RUN mkdir -p /app/storage/books /app/storage/covers

EXPOSE 4000
CMD ["npm","start"]
