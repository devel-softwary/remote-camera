FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
RUN mkdir -p /app/data && chown -R 1000:1000 /app/data
EXPOSE 3000
CMD ["npm", "start"]
