FROM node:20-alpine

WORKDIR /app

# Install system dependencies required for some node modules (like canvas or python for build tools)
# Adding git if dependencies need to be fetched from git
RUN apk add --no-cache git python3 make g++

COPY package*.json ./

RUN npm install --production

COPY . .

# Create sessions directory and ensure permissions
RUN mkdir -p sessions && chown -R node:node sessions

USER node

EXPOSE 8000

CMD ["npm", "start"]
