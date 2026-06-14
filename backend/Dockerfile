# Stage 1: Build React Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Setup Express Backend
FROM node:20-alpine
WORKDIR /app
COPY backend/package*.json ./
RUN npm install
COPY backend/prisma ./prisma/
RUN npx prisma generate
COPY backend/ ./
COPY --from=frontend-builder /frontend/dist /frontend/dist

EXPOSE 5000
CMD ["npm", "start"]
