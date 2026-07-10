# ---- Build stage ----
FROM node:20-alpine AS builder
WORKDIR /app
# Install required system dependencies for Prisma
RUN apk add --no-cache openssl1.1-compat
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

# ---- Production stage ----
FROM node:20-alpine
WORKDIR /app
# Install required system dependencies for Prisma
RUN apk add --no-cache openssl1.1-compat
ENV NODE_ENV=production
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
EXPOSE 4000
CMD ["node", "dist/src/server.js"]
