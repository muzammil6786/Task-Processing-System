# Task Processing System

A production-ready backend system built with **Node.js**, **Express**, **PostgreSQL**, **BullMQ**, and **Socket.IO**.

Users register, log in, submit tasks, and receive real-time status updates as those tasks are processed asynchronously in the background.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        HTTP Client                              │
│              (REST API  +  Socket.IO  WebSocket)                │
└──────────────┬──────────────────────────────────┬──────────────┘
               │  HTTP                            │  WS
               ▼                                  ▼
┌─────────────────────────┐          ┌────────────────────────────┐
│     Express API         │          │     Socket.IO Server       │
│  ┌──────────────────┐   │          │  • JWT middleware           │
│  │  Auth Routes     │   │          │  • user:<id> rooms          │
│  │  Task Routes     │   │          │  • task:status_update event │
│  └────────┬─────────┘   │          └────────────▲───────────────┘
│           │             │                       │
│  ┌────────▼─────────┐   │          ┌────────────┴───────────────┐
│  │   Controllers    │   │          │      BullMQ Worker          │
│  └────────┬─────────┘   │          │  • Picks jobs from Redis    │
│           │             │          │  • Runs processor fn        │
│  ┌────────▼─────────┐   │          │  • Updates task in PG       │
│  │    Services      │   │          │  • Emits Socket.IO event    │
│  └────────┬─────────┘   │          └────────────────────────────┘
│           │             │                       ▲
│  ┌────────▼─────────┐   │                       │
│  │   Data Models    │──►│──── enqueue() ────────┘
│  └────────┬─────────┘   │
└───────────┼─────────────┘
            │
    ┌───────┴──────┐
    ▼              ▼
 PostgreSQL       Redis
 (tasks, users,  (BullMQ queues,
  refresh tokens) job state)
```

### Key Design Decisions

| Decision | Rationale |
|---|---|
| **Layered architecture** (routes → controllers → services → models) | Clear separation of concerns; easy to test each layer in isolation |
| **BullMQ with exponential backoff** | Reliable retry logic; jobs survive crashes; priority queue support |
| **Worker as a separate process** | CPU-bound work doesn't block the event loop; independently scalable |
| **JWT access + opaque refresh tokens** | Short-lived access tokens limit blast radius; refresh token rotation prevents reuse attacks |
| **PostgreSQL ENUM types** | Self-documenting schema; DB-level constraint enforcement |
| **Immutable task_logs table** | Full audit trail; useful for debugging and compliance |
| **Socket.IO rooms (user:<id>)** | Users only receive their own task events; no polling needed |

---

## Project Structure

```
task-processing-system/
|── logs/ log_files
├── migrations/
│   ├── 001_initial_schema.sql   # Database DDL
│   └── migrate.js               # Migration runner
├── src/
│   ├── config/
│   │   ├── env.js               # Validated env config (fail-fast)
│   │   ├── database.js          # pg Pool + transaction helper
│   │   └── redis.js             # ioredis factory
│   ├── controllers/
│   │   ├── authController.js    # HTTP ↔ service bridge for auth
│   │   └── taskController.js    # HTTP ↔ service bridge for tasks
│   ├── middleware/
│   │   ├── auth.js              # JWT Bearer + Socket.IO middleware
│   │   ├── errorHandler.js      # Global error handler + AppError
│   │   └── validate.js          # express-validator rules
│   ├── models/
│   │   ├── userModel.js         # users + refresh_tokens queries
│   │   └── taskModel.js         # tasks + task_logs queries
│   ├── queues/
│   │   ├── taskQueue.js         # BullMQ Queue (producer)
│   │   ├── taskWorker.js        # BullMQ Worker (consumer)
│   │   └── processors/
│   │       └── index.js         # Per-type processing functions
│   ├── routes/
│   │   ├── authRoutes.js
│   │   └── taskRoutes.js
│   ├── services/
│   │   ├── authService.js       # Registration, login, logout
│   │   └── taskService.js       # Creating Task lifecycle management
│   ├── utils/
│   │   ├── apiResponse.js       # Consistent response envelope
│   │   ├── jwt.js               # Sign / verify access + refresh tokens
│   │   └── logger.js            # Winston structured logger
│   ├── websocket/
│   │   └── socketManager.js     # Socket.IO init + room management
│   ├── app.js                   # Express setup 
│   └── server.js                # Entry point + graceful shutdown

```

---

## Database Schema

```sql
users            — accounts (id, email, password_hash, name, is_active)
refresh_tokens   — hashed refresh tokens with expiry + revoked flag
tasks            — task records with status, payload, result, audit fields
task_logs        — immutable status-transition audit trail
```

**Task status flow:**
```
pending ──► processing ──► completed
                      └──► failed
```

---

## Getting Started

### Prerequisites

- Node.js ≥ 18
- PostgreSQL ≥ 14
- Redis ≥ 6

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your PostgreSQL and Redis credentials
```

### 3. Create the database

```bash
createdb task_processing
```

### 4. Run migrations

```bash
npm run migrate
```

### 5. Start the server

```bash
# Development (server + inline worker + hot reload)
npm run dev

# Production server only
npm start

# Production worker (separate process)
npm run worker
```

---

## API Reference

All endpoints return:
```json
{ "success": true, "message": "...", "data": { ... } }
{ "success": false, "error": { "message": "...", "code": "MACHINE_CODE" } }
```

### Authentication

#### Register
```
POST /auth/register
Body: { "email": "user@example.com", "password": "SecurePass1", "name": "Alice" }

201 → { user, accessToken }   +  Set-Cookie: refreshToken (httpOnly)
409 → EMAIL_TAKEN
422 → VALIDATION_ERROR
```

#### Login
```
POST /auth/login
Body: { "email": "user@example.com", "password": "SecurePass1" }

200 → { user, accessToken }   +  Set-Cookie: refreshToken
401 → INVALID_CREDENTIALS
```

#### Refresh Token
```
POST /auth/refresh
Cookie: refreshToken=<token>   OR   Body: { "refreshToken": "..." }

200 → { user, accessToken }   +  New Set-Cookie: refreshToken
401 → INVALID_REFRESH_TOKEN | TOKEN_REUSE
```

#### Logout
```
POST /auth/logout

200 → clears refreshToken cookie
```


---

### Tasks

All task endpoints require `Authorization: Bearer <accessToken>`.

#### Create Task
```
POST /tasks
Body: {
  "type": "data_processing" | "report_generation" | "email_sending" | "file_conversion",
  "payload": { ... },          // task-specific data
  "priority": 0-10,            // optional, default 0
  "maxAttempts": 1-5,          // optional, default 3
  "scheduledAt": "ISO8601"     // optional, for delayed processing
}

201 → { id, type, status: "pending", payload, ... }
422 → VALIDATION_ERROR
```

#### List Tasks
```
GET /tasks?status=pending&type=data_processing&limit=20&offset=0

200 → {
  data: [...tasks],
  meta: { total, limit, offset, hasMore }
}
```

#### Get Task
```
GET /tasks/:id

200 → { id, user_id, type, status, payload, result, error_message, ... }
404 → TASK_NOT_FOUND
422 → invalid UUID
```

#### Get Task Logs
```
GET /tasks/:id/logs

200 → [{ from_status, to_status, message, metadata, created_at }, ...]
```

#### Cancel Task
```
DELETE /tasks/:id

200 → updated task (status: "failed", error_message: "Cancelled by user")
409 → INVALID_STATUS_TRANSITION (if not pending)
```

---

### Health Check
```
GET /health

200 → { status: "ok", services: { database, redis } }
503 → service unavailable
```

---

## Real-Time Updates (Socket.IO)

```javascript
import { io } from "socket.io-client";

const socket = io("http://localhost:3000", {
  auth: { token: "<accessToken>" }   // JWT required
});

// Automatically receive updates for all your tasks
socket.on("task:status_update", ({ taskId, status, result, errorMessage, timestamp }) => {
  console.log(`Task ${taskId} → ${status}`);
});

// Optionally subscribe to a specific task
socket.emit("subscribe:task", taskId);
socket.emit("unsubscribe:task", taskId);
```

**Events emitted by server:**

| Event | Payload | When |
|---|---|---|
| `task:status_update` | `{ taskId, status, result, errorMessage, timestamp }` | On every status transition |

---

## Security

- Passwords hashed with **bcrypt** (12 rounds)
- JWT access tokens expire in **15 minutes**
- Refresh tokens are stored as **SHA-256 hashes** — the raw token is never persisted
- **Token rotation**: each refresh issues a new token and revokes the old one
- **Reuse detection**: if a revoked token is presented, all user tokens are revoked
- `httpOnly` + `Secure` + `SameSite=Strict` cookies for refresh tokens
- **Helmet** sets secure HTTP headers
- **Rate limiting** on all routes; stricter limit on auth endpoints
- Ownership enforced on every task query (`WHERE user_id = $userId`)

---
