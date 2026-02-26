FROM node:22-alpine
WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install
COPY src ./src
RUN npm run build
COPY src/public ./dist/public
EXPOSE 8080
CMD ["npm","run","start"]
