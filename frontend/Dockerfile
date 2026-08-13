# Use the official Node.js image
FROM node:20-alpine

# Set the working directory
WORKDIR /app

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm install

# Copy the frontend code
COPY . .

# Expose the frontend port
EXPOSE 3000

# Start the Next.js development server
CMD ["npm", "run", "dev"]