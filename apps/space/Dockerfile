FROM node:20-slim
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages ./packages
COPY apps/space ./apps/space
RUN npm install -g pnpm && pnpm install && pnpm build
WORKDIR /app/apps/space
ENV PORT=7860
EXPOSE 7860
CMD ["pnpm", "start"]
