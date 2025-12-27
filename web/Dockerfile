FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG NEXT_PUBLIC_LAN_IP
ARG NEXT_PUBLIC_API_PORT
ARG NEXT_PUBLIC_LIVEKIT_PORT
ENV NEXT_PUBLIC_LAN_IP=$NEXT_PUBLIC_LAN_IP
ENV NEXT_PUBLIC_API_PORT=$NEXT_PUBLIC_API_PORT
ENV NEXT_PUBLIC_LIVEKIT_PORT=$NEXT_PUBLIC_LIVEKIT_PORT
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY public ./public
EXPOSE 3000
CMD ["node", "server.js"]
