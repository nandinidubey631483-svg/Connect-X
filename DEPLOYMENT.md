# ConnectX Production Deployment Guide

This guide provides end-to-end instructions for deploying the **ConnectX** real-time collaboration platform into production environments.

---

## 1. System Architecture & Prerequisites

ConnectX is built as a production-grade decoupled fullstack system:
- **Frontend**: React SPA (React Router v6, Styled-Components, Socket.IO Client, WebRTC)
- **Backend**: Node.js & Express REST API (v1 API endpoints, CSRF protection, HttpOnly cookie security)
- **Real-Time Gateway**: Socket.IO WebSockets (Presence engine, typing indicators, instant messaging, call signaling)
- **Audio & Video Calling**: Peer-to-peer WebRTC (Google STUN default + optional Coturn/Twilio TURN)
- **Database**: MongoDB 5.0+ (Mongoose ODM with connection pooling & automated index synchronization)
- **Email Delivery**: Nodemailer SMTP (Live OTP verification, notifications)
- **Distributed Cache (Optional)**: Redis 6+ (Presence clustering, sliding-window rate limiters)

### Minimum Server Requirements
- **CPU**: 1 vCPU (2 vCPUs recommended for WebSockets with 500+ concurrent connections)
- **RAM**: 1 GB minimum (2 GB recommended)
- **Node.js**: v18.x or v20.x LTS
- **MongoDB**: Atlas M0+ or self-hosted 6.x/7.x

---

## 2. Deployment Topologies

ConnectX supports three production topologies:

### Topology A: Subdomain Architecture (Recommended)
- **Frontend**: `https://app.yourdomain.com` (Vercel, Netlify, Cloudflare Pages, S3/CloudFront)
- **Backend**: `https://api.yourdomain.com` (Render, Railway, Fly.io, AWS ECS, VPS)
- **Cookie Topology**: `same-site`
- **Cookie Domain**: `.yourdomain.com`

### Topology B: Unified Reverse Proxy / Monolith
- **Single Host / Domain**: `https://yourdomain.com`
- **Reverse Proxy (Nginx/Caddy)**:
  - `/` routes to static frontend build
  - `/api` and `/socket.io` route to backend port `5000`
- **Cookie Topology**: `same-origin`
- **Cookie Domain**: leave unset

### Topology C: Fully Decoupled / Staging
- **Frontend**: `https://my-app.vercel.app`
- **Backend**: `https://my-api.onrender.com`
- **Cookie Topology**: `cross-site`
- **Cookie Settings**: `CROSS_SITE_COOKIES=true` (SameSite: None, Secure: true, Partitioned: true)

---

## 3. Environment Variables Reference

### Backend (`server/.env`)

| Variable | Required | Default | Description |
| :--- | :---: | :--- | :--- |
| `PORT` | No | `5000` | Port for the HTTP and WebSocket server |
| `NODE_ENV` | **Yes** | `development` | Set to `production` |
| `MONGO_URL` | **Yes** | - | MongoDB connection URI (e.g. Atlas connection string) |
| `MONGO_MAX_POOL_SIZE` | No | `50` | Maximum MongoDB connection pool size |
| `ALLOWED_ORIGINS` | **Yes** | - | Comma-separated allowed frontend origins (e.g. `https://app.yourdomain.com`) |
| `TRUST_PROXY` | **Yes** | `1` | Set to `1` when behind Nginx, Cloudflare, AWS ALB, or Heroku/Render |
| `JWT_ACCESS_SECRET` | **Yes** | - | Min 64-char random hex string for signing access tokens |
| `JWT_REFRESH_SECRET` | **Yes** | - | Min 64-char random hex string for signing refresh tokens |
| `CSRF_SECRET` | **Yes** | - | Min 64-char random hex string for double-submit CSRF protection |
| `COOKIE_SECRET` | No | - | Min 64-char random hex string for signed session cookies |
| `COOKIE_TOPOLOGY` | No | `same-site` | `same-site`, `same-origin`, or `cross-site` |
| `COOKIE_DOMAIN` | No | - | Root domain with leading dot (e.g. `.yourdomain.com`) |
| `CROSS_SITE_COOKIES`| No | `false` | Enable `true` for cross-site cookie partitioning (CHIPS) |
| `SMTP_HOST` | **Yes** | - | SMTP server address (e.g. `smtp.gmail.com` or `smtp.sendgrid.net`) |
| `SMTP_PORT` | No | `587` | `587` for STARTTLS or `465` for SSL |
| `SMTP_SECURE` | No | `false` | Set `true` if port `465`, `false` for port `587` |
| `SMTP_USER` | **Yes** | - | SMTP username or email address |
| `SMTP_PASS` | **Yes** | - | SMTP password or App Password (no spaces) |
| `EMAIL_FROM` | No | - | Sender address e.g. `"ConnectX" <no-reply@yourdomain.com>` |
| `REDIS_URL` | No | - | Redis URI for clustering & sliding window rate limits |
| `TURN_URL` | No | - | Comma-separated TURN server URIs |
| `TURN_USERNAME` | No | - | TURN server username |
| `TURN_CREDENTIAL` | No | - | TURN server credential / secret |

### Frontend (`public/.env` / Build Environment)

| Variable | Required | Description |
| :--- | :---: | :--- |
| `REACT_APP_API_URL` | **Yes** | Backend URL without trailing slash (e.g. `https://api.yourdomain.com`) |
| `REACT_APP_SOCKET_URL` | **Yes** | WebSocket gateway URL (e.g. `https://api.yourdomain.com`) |
| `REACT_APP_LOCALHOST_KEY`| No | LocalStorage session key (default: `"chat-app-current-user"`) |

---

## 4. Secret Generation

Before deploying, generate strong 64-character cryptographic secrets for all keys:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
Run this 4 times to generate separate unique strings for:
1. `JWT_ACCESS_SECRET`
2. `JWT_REFRESH_SECRET`
3. `CSRF_SECRET`
4. `COOKIE_SECRET`

---

## 5. Deployment Options

### Option 1: Docker Deployment (Recommended for VPS / Cloud)

#### 1. Build the production Docker image
Create a `Dockerfile` in the project root:

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY public/package*.json ./public/
RUN cd public && npm ci --legacy-peer-deps
COPY public/ ./public/
ARG REACT_APP_API_URL
ARG REACT_APP_SOCKET_URL
ENV REACT_APP_API_URL=$REACT_APP_API_URL
ENV REACT_APP_SOCKET_URL=$REACT_APP_SOCKET_URL
RUN cd public && npm run build

FROM node:20-alpine
WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm ci --only=production
COPY server/ ./server/
COPY --from=builder /app/public/build ./public/build
ENV NODE_ENV=production
ENV PORT=5000
EXPOSE 5000
CMD ["node", "server/index.js"]
```

#### 2. Run with Docker Compose (`docker-compose.yml`)
```yaml
version: "3.8"
services:
  connectx:
    build:
      context: .
      args:
        REACT_APP_API_URL: https://api.yourdomain.com
        REACT_APP_SOCKET_URL: https://api.yourdomain.com
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=production
      - PORT=5000
      - MONGO_URL=mongodb+srv://user:pass@cluster.mongodb.net/chat?retryWrites=true&w=majority
      - ALLOWED_ORIGINS=https://app.yourdomain.com
      - TRUST_PROXY=1
      - JWT_ACCESS_SECRET=your_secret_here
      - JWT_REFRESH_SECRET=your_secret_here
      - CSRF_SECRET=your_secret_here
      - SMTP_HOST=smtp.gmail.com
      - SMTP_PORT=587
      - SMTP_USER=your_email@gmail.com
      - SMTP_PASS=your_app_password
    restart: always
```

---

### Option 2: Render / Railway / Fly.io

1. **Deploy Backend (Web Service)**:
   - Root directory: `server`
   - Build Command: `npm ci --only=production`
   - Start Command: `node index.js`
   - Health check path: `/health`
   - Add all environment variables from Section 3.

2. **Deploy Frontend (Static Site)**:
   - Root directory: `public`
   - Build Command: `npm ci --legacy-peer-deps && npm run build`
   - Publish Directory: `build`
   - Environment variables:
     - `REACT_APP_API_URL`: `https://your-backend.onrender.com`
     - `REACT_APP_SOCKET_URL`: `https://your-backend.onrender.com`
   - Add SPA Rewrite Rule: `/* -> /index.html (200)`

---

### Option 3: VPS with Nginx Reverse Proxy & PM2

#### 1. PM2 Process Manager
```bash
cd server
npm ci --only=production
pm2 start index.js --name "connectx-api" -i max
pm2 save
pm2 startup
```

#### 2. Nginx Configuration (`/etc/nginx/sites-available/connectx`)
```nginx
server {
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

Enable SSL using Let's Encrypt:
```bash
sudo certbot --nginx -d api.yourdomain.com -d app.yourdomain.com
```

---

## 6. Verification Checklist

After deploying, verify the deployment:

1. **Health Check**:
   ```bash
   curl -i https://api.yourdomain.com/health
   # Expected: HTTP 200 {"success":true,"data":{"status":"healthy",...}}
   ```
2. **CORS & Origin Verification**:
   ```bash
   curl -i -H "Origin: https://app.yourdomain.com" https://api.yourdomain.com/api/v1/auth/csrf-token
   # Expected: access-control-allow-origin: https://app.yourdomain.com
   ```
3. **Socket.IO Handshake**:
   - Open browser console on frontend -> verify WebSocket connects to `/socket.io/?EIO=4&transport=websocket`.
4. **Registration & Live OTP**:
   - Register a new account -> Verify OTP code is delivered to inbox from configured SMTP provider.
5. **WebRTC Calling**:
   - Verify ICE candidate exchange connects between two online users.
