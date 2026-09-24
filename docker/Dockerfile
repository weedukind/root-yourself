# Development image for a Next.js project on Node.js 24 (current LTS)
FROM node:24-alpine

WORKDIR /app

# Install dependencies separately to leverage Docker layer caching
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN \
  if [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm install; \
  elif [ -f yarn.lock ]; then corepack enable yarn && yarn install; \
  elif [ -f package-lock.json ]; then npm ci; \
  else npm install; \
  fi

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
