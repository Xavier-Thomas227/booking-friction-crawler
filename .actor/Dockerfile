FROM apify/actor-node-playwright-chrome:20 AS builder

COPY --chown=myuser package*.json ./
RUN npm install --include=dev --audit=false

COPY --chown=myuser . ./
RUN npm run build

FROM apify/actor-node-playwright-chrome:20

COPY --from=builder --chown=myuser /home/myuser/dist ./dist
COPY --chown=myuser package*.json ./
RUN npm install --omit=dev --omit=optional

COPY --chown=myuser . ./

CMD ["node", "dist/main.js"]
