FROM apify/actor-node-playwright-chrome:20

COPY --chown=myuser package*.json ./
RUN npm install --include=dev --audit=false

COPY --chown=myuser . ./
RUN npm run build

RUN ls -la dist/

CMD ["node", "dist/main.js"]
