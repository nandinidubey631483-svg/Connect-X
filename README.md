# ConnectX — Real-Time Communication & Collaboration Platform

ConnectX is a production-grade, full-stack real-time communication platform built on the MERN stack with distributed presence, security hardening, robust messaging, delivery/read receipts, media sharing, and real-time notification engine.

---

## Architecture & Features

### Core Capabilities
- **Authentication & Security (Phase 4):**
  - Dual-token JWT (short-lived access tokens, rotation-secured refresh tokens).
  - Cryptographic CSRF protection with double-submit cookie validation.
  - Strict Origin & Cross-Site WebSocket Hijacking (CSWSH) protection.
  - Fail-closed distributed governance and account lockout protection (15 minutes after 5 failed attempts).
- **User Profiles & Settings (Phase 5 Modules 1–2):**
  - Full profile management (display names, bios, status messages, avatar selection).
  - User settings engine (notifications, privacy levels, last-seen visibility, chat display options).
- **Distributed Presence & Heartbeat Engine (Phase 5 Module 3):**
  - Dual in-memory and Redis-backed distributed heartbeat tracking.
  - Multi-session concurrency management per user with resilient disconnect cleanup.
- **Contact Discovery & Social Graph (Phase 5 Module 4):**
  - Paginated user search with regex injection defense.
  - Friend / contact request lifecycle state machine (`PENDING`, `ACCEPTED`, `REJECTED`, `CANCELLED`).
  - Mutual contact list management and removal.
- **Conversation & Chat Management (Phase 5 Module 5):**
  - Deterministic participant hashing preventing duplicate 1-to-1 conversations.
  - Authenticated conversation membership verification and last message metadata tracking.
- **Real-Time Messaging Engine (Phase 5 Module 6):**
  - Persistent message storage committed to MongoDB before acknowledgment or broadcast.
  - Server-authoritative sender identification preventing impersonation.
  - Reconnect synchronization via Socket.IO (`message:sync`).
- **Delivery & Read Receipts Engine (Phase 5 Module 7):**
  - Reliable message delivery lifecycle tracking: `SENT` $\rightarrow$ `DELIVERED` $\rightarrow$ `READ`.
  - Privacy-aware read receipt suppression based on user preferences.
- **Media & File Sharing (Phase 5 Module 8):**
  - Multi-type messaging (`TEXT`, `IMAGE`, `FILE`) with inline previews and secure participant-authorized downloads (`GET /api/v1/messages/media/:id`).
  - Strict 5MB file size limit and dangerous extension filtering (`.exe`, `.sh`, `.bat`, etc.).
- **Notification Engine (Phase 5 Module 9):**
  - Real-time Socket.IO notification delivery (`notification:new`, `notification:count`) respecting user preferences (`pushNotifications`, `soundEnabled`).
  - Deduplicated notification events with compound indexing and unread badge counters.
- **Real-Time Voice & Video Calling (Phase 5 Module 11):**
  - WebRTC peer-to-peer real-time audio and video communications.
  - Socket.IO signaling gateway supporting call initiation, ringing, acceptance, rejection, cancellation, offer/answer SDP negotiation, ICE candidate exchange, and termination.
  - Configurable STUN/TURN ICE server dispatch.
  - Active voice calling screen with live duration timer, mute/unmute, and speaker toggles.
  - Active video calling screen with full remote video, PiP local preview, and camera flip/toggle.
  - 35s ringing timeout with automatic `MISSED_CALL` notifications.
  - Filterable call history log (All, Missed, Voice, Video) with one-click callback.
- **Studio Redesign UI (Phase 5 Module 10):**
  - Modern warm studio editorial palette (`#D9480F` Terracotta, `#F3EEE6` Linen Canvas, `#FFFDF9` Warm Cards).
  - Fully responsive grid layout with custom search, direct messaging lists, rich message bubbles, and notification dropdown.

---

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/en/) (v16+ recommended)
- [MongoDB](https://www.mongodb.com/) (v5.0+ running on port 27017)

### Installation & Startup

1. **Configure Environment Variables:**
   ```bash
   # Server environment (chat-app-react-nodejs/server/.env)
   PORT=5000
   NODE_ENV=development
   MONGO_URL="mongodb://localhost:27017/chat"
   ALLOWED_ORIGINS="http://localhost:3000"
   JWT_ACCESS_SECRET="<64-hex-char-secret>"
   JWT_REFRESH_SECRET="<64-hex-char-secret>"
   CSRF_SECRET="<64-hex-char-secret>"

   # Email Delivery Service (Nodemailer SMTP)
   SMTP_HOST="smtp.gmail.com"
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER="your_email@gmail.com"
   SMTP_PASS="your_app_specific_password_or_smtp_token"
   EMAIL_FROM="ConnectX Security <no-reply@connectx.local>"

   # Frontend environment (chat-app-react-nodejs/public/.env)
   REACT_APP_LOCALHOST_KEY="chat-app-current-user"
   REACT_APP_API_URL="http://localhost:5000"
   REACT_APP_SOCKET_URL="http://localhost:5000"
   ```

2. **Run MongoDB:**
   Ensure MongoDB is running on port 27017:
   ```powershell
   & "C:\Program Files\MongoDB\Server\8.2\bin\mongod.exe" --dbpath "<path_to_data>" --bind_ip 127.0.0.1 --port 27017
   ```

3. **Start Backend Server:**
   ```bash
   cd chat-app-react-nodejs/server
   npm install
   node index.js
   ```
   *Health endpoint accessible at: `http://localhost:5000/health`*

4. **Start Frontend Dev Server:**
   ```bash
   cd chat-app-react-nodejs/public
   npm install
   npm start
   ```
   *Application accessible at: `http://localhost:3000`*

---

## Automated Test Suites

ConnectX features **314 automated tests** with 100% pass rate:

- **Backend Test Suite (245 tests, 85 suites):**
  ```bash
  cd chat-app-react-nodejs/server
  node --test tests/notificationEngine.test.js tests/mediaSharing.test.js tests/deliveryReceipts.test.js tests/realtimeMessaging.test.js tests/conversations.test.js tests/contacts.test.js tests/presence.test.js tests/settings.test.js tests/profile.test.js tests/e2eAudit.test.js tests/socketAuth.test.js tests/authEngine.test.js tests/middlewares.test.js tests/cryptoUtils.test.js tests/schemas.test.js tests/foundation.test.js
  ```

- **Frontend Test Suite (69 tests, 16 suites):**
  ```bash
  cd chat-app-react-nodejs/public
  npm test -- --watchAll=false
  ```

- **Production Build Check:**
  ```bash
  cd chat-app-react-nodejs/public
  npm run build
  ```
