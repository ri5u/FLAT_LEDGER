FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy database schema
COPY prisma ./prisma/

# Generate Prisma Client
RUN npx prisma generate

# Copy application files
COPY . .

EXPOSE 5000

# Start command
CMD ["npm", "start"]
