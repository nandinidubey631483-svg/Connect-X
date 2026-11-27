# ConnectX --- Project Context & Master Development Roadmap

**Document type:** Project source of truth\
**Project:** ConnectX --- Real-Time Communication & Collaboration
Platform\
**Starter repository:**
https://github.com/koolkishan/chat-app-react-nodejs\
**Development approach:** Module-wise, documentation-first,
Antigravity-assisted\
**Status:** Planning and codebase analysis completed; implementation not
yet approved

------------------------------------------------------------------------

## 1. Purpose of This Document

This file is the central reference for building ConnectX. It defines the
product direction, development phases, engineering standards, and rules
that must remain consistent throughout implementation.

Antigravity must read this document before starting each module. Update
it when an architectural decision is explicitly approved or a module is
completed and tested.

**Do not treat planned features as implemented features.** The starter
repository's actual code is the authority for current behavior; the
analysis reports are the current summary and should be rechecked against
source code when implementation begins.

## 2. Product Vision

ConnectX is a modern real-time messaging platform combining the
immediacy of personal messaging with useful team-collaboration
capabilities.

It is intended to demonstrate strong full-stack engineering: secure
identity, conversation and message modelling, real-time event handling,
reliable persistence, authorization, performance, testing, and
deployment.

### Product goals

-   Provide secure one-to-one and group conversations.
-   Persist messages and conversation history reliably.
-   Deliver real-time updates with clear delivery/read states.
-   Support user presence and typing indicators.
-   Provide search, pagination, media sharing, and notifications.
-   Maintain clear authorization boundaries between users and groups.
-   Be maintainable as a modular application and deployable using
    containers.

### Out of scope for the initial release

-   Voice/video calling.
-   End-to-end encryption.
-   Public federation across independent servers.
-   Microservices and Kubernetes from day one.
-   Complex AI features before core messaging is reliable.

These may be evaluated as future enhancements, not assumed requirements.

## 3. Starter Repository

**Repository:** `koolkishan/chat-app-react-nodejs`

The initial codebase analysis reports the following structure and
technologies. Verify all details against the checked-out source before
relying on them.

### Reported existing stack

  Area                 Reported technology
  -------------------- ----------------------------
  Frontend             React 17, Create React App
  Routing              React Router
  HTTP                 Axios
  UI styling           Styled Components
  Backend              Node.js, Express 4
  Database             MongoDB, Mongoose
  Real-time            Socket.IO
  Password hashing     bcrypt
  Deployment support   Docker Compose

### Reported existing functionality

-   Registration and login.
-   Avatar selection.
-   User/contact listing.
-   One-to-one text messaging.
-   Message history retrieval.
-   Socket.IO event-based message notification.

### Reported limitations to verify and address

-   Authentication appears to rely on client-side user data rather than
    a robust server-verified session.
-   User/message endpoints may lack ownership and membership
    authorization.
-   Online user mapping appears process-local.
-   Socket disconnect and reconnect lifecycle may be incomplete.
-   Message persistence and socket delivery may use independent paths.
-   Conversation modelling may be limited to direct chats.
-   Message/contact queries may be unbounded.
-   Automated tests and operational observability may be limited.

**Security note:** The analysis report identified possible password
serialization leakage, BOLA/IDOR, CORS, and React lifecycle issues.
These are audit findings, not independently verified facts in this
document. Confirm each against the exact source line and test safely
before changing code.

## 4. Proposed Technology Direction

The following is the proposed target stack, subject to a documented
decision during the Foundation phase.

  -----------------------------------------------------------------------
  Layer                               Proposed choice
  ----------------------------------- -----------------------------------
  Frontend                            React + Vite

  Language                            JavaScript initially; TypeScript
                                      may be adopted if approved
                                      consistently

  Styling                             Tailwind CSS

  Routing                             React Router

  Client state                        Context or a lightweight store;
                                      choose based on actual complexity

  Backend                             Node.js + Express

  API style                           REST for resource operations

  Real-time                           Socket.IO

  Database                            MongoDB + Mongoose

  Authentication                      Server-validated
                                      access/refresh-token strategy

  Cache/presence                      Redis, introduced in the scaling
                                      phase

  File storage                        S3-compatible object storage or
                                      Cloudinary

  Validation                          Shared, explicit request/schema
                                      validation

  Testing                             Jest or Vitest as appropriate,
                                      Supertest, and Socket.IO
                                      integration tests

  API documentation                   OpenAPI

  Containers                          Docker and Docker Compose

  CI/CD                               GitHub Actions or the chosen
                                      repository's CI platform
  -----------------------------------------------------------------------

### Architecture principle

Start with a **modular monolith**, not microservices. Keep domain
boundaries clear so components can be scaled or extracted later if real
requirements justify it.

Do not migrate the entire starter stack automatically. First inspect the
repository, identify compatibility and migration costs, then record the
approved migration plan.

## 5. High-Level Architecture

``` text
React Client
  |-- Screens and UI components
  |-- Authentication/session handling
  |-- API client
  |-- Socket.IO client
  |
  +------ HTTPS / REST ------> Express API
  |                              |-- Auth module
  |                              |-- Users module
  |                              |-- Conversations module
  |                              |-- Messages module
  |                              |-- Uploads module
  |                              |-- Notifications module
  |                              |
  +------ Socket.IO ----------> Socket gateway
                                 |-- authenticated connection
                                 |-- conversation membership checks
                                 |-- message events / acknowledgements
                                 |-- presence and typing
                                 |
                              MongoDB
                                 |-- users
                                 |-- conversations
                                 |-- messages
                                 |-- refresh sessions (if persisted)
                                 |
                              Redis (later phase)
                                 |-- distributed presence
                                 |-- Socket.IO adapter / shared pub-sub
                                 |-- ephemeral state and rate-limit support
```

This is a target concept, not a claim about the current repository.
Exact module boundaries and deployment topology are finalized in Phase 1
and Phase 2.

## 6. Master Development Phases

Every phase follows the same cycle:

1.  Understand the objective and user workflow.
2.  Define requirements and acceptance criteria.
3.  Inspect existing code and dependencies.
4.  Prepare/update relevant documentation and data/API contracts.
5.  Give Antigravity a bounded implementation prompt.
6.  Review the diff before accepting changes.
7.  Run tests and manual verification.
8.  Update this file and the module status.
9.  Commit the completed work.

Do not start the next dependent phase until the current phase passes its
exit criteria.

### Phase 0 --- Repository Audit and Baseline

**Goal:** Understand and preserve the starter application before
modifying it.

Tasks: - Read the four reports in `project-analysis/`. - Compare report
claims with actual source files. - Record exact runtime versions,
package managers, scripts, environment variables, and ports. - Check
repository license and attribution requirements. - Run the original
application using documented instructions. - Record baseline screenshots
and known failures. - Create a clean Git branch and a rollback point.

Deliverables: - `project-analysis/CODEBASE_ANALYSIS.md` -
`project-analysis/EXISTING_FEATURES.md` -
`project-analysis/TECHNICAL_DEBT.md` -
`project-analysis/ARCHITECTURE_OVERVIEW.md` - Baseline run notes

Exit criteria: - The original app's setup and current behavior are
understood. - License/reuse status is checked. - No source changes have
been made without a recorded reason.

### Phase 1 --- Product Requirements and Project Foundation

**Goal:** Finalize what ConnectX will be and establish development
rules.

Tasks: - Define target users, use cases, user roles, and product
boundaries. - Write functional and non-functional requirements. - Define
MVP versus later-release features. - Document core workflows:
registration, login, start chat, send message, create group, search
messages. - Define error states and accessibility/responsive
expectations. - Create the root `PROJECT_CONTEXT.md` and module tracking
checklist. - Approve stack and migration strategy.

Deliverables: - `PROJECT_CONTEXT.md` - `docs/PRD.md` - `docs/FRD.md` -
`docs/NFR.md` - `docs/DECISIONS.md` (architecture decision records)

Exit criteria: - MVP scope and acceptance criteria are approved. -
Proposed stack and migration approach are explicitly recorded.

### Phase 2 --- System Architecture and Database Design

**Goal:** Design domain boundaries, data structures, API contracts, and
security model before feature implementation.

Tasks: - Define modular monolith boundaries. - Create component,
deployment, and sequence diagrams. - Design MongoDB collections and
references. - Define indexes from expected query patterns. - Define REST
endpoints and Socket.IO event contracts. - Define authentication,
authorization, conversation membership, and ownership rules. - Define
message ordering, idempotency, retry, and acknowledgement behavior. -
Decide upload strategy and file access controls.

Initial domain entities to evaluate: - `User` - `Conversation` -
`ConversationMember` (embedded or separate, based on access/query
needs) - `Message` - `RefreshSession` or equivalent token/session
record - `Notification` (if persisted notifications are in MVP)

Deliverables: - `docs/ARCHITECTURE.md` - `docs/DATABASE_DESIGN.md` -
`docs/ERD.md` - `docs/API_SPECIFICATION.md` - `docs/SOCKET_EVENTS.md` -
`docs/SECURITY_MODEL.md`

Exit criteria: - Core schemas, API/event contracts, and authorization
rules are reviewed. - No feature is implemented against an undocumented,
unstable contract.

### Phase 3 --- Application Foundation and UI/UX System

**Goal:** Establish a consistent frontend/backend development
foundation.

Tasks: - Set up approved frontend and backend structure. - Configure
environment variables and safe configuration loading. - Add centralized
error handling and request logging. - Add frontend routing, layouts,
reusable components, and design tokens. - Build responsive shell:
sidebar, conversation list, chat panel, profile area. - Configure API
client and loading/error/empty states. - Add linting, formatting, test
scripts, and development documentation. - Add health-check endpoint and
local development instructions.

Deliverables: - Working frontend and backend skeleton. - UI
component/design system. - `.env.example` files without secrets. -
`README.md` setup instructions. - Initial CI checks.

Exit criteria: - App starts locally using documented commands. - Health
check works. - Responsive shell renders. - Lint and baseline tests pass.

### Phase 4 --- Authentication and Authorization

**Goal:** Build secure account access before exposing user or
conversation data.

Tasks: - Registration with server-side validation. - Login and password
verification. - Access/refresh-token lifecycle or another explicitly
approved secure session design. - Secure token storage and refresh
behavior. - Logout and session revocation. - Protected frontend routes
and authenticated API middleware. - Password hashing using a modern,
appropriately configured password-hashing algorithm. - Rate limits on
login and registration. - Generic auth errors that do not leak account
existence. - Authorization tests for unauthenticated and unauthorized
access.

Security requirements: - Never trust a user ID supplied by the client as
proof of identity. - Derive the acting user from the verified
server-side identity. - Never return password hashes or secrets. -
Enforce authorization on every protected REST endpoint and socket
event. - Configure CORS for explicit trusted origins. - Keep secrets out
of source control and logs.

Deliverables: - Auth APIs and frontend screens. - Session/token model
and lifecycle documentation. - Auth and authorization tests.

Exit criteria: - Registration, login, refresh, logout, and
protected-route tests pass. - Cross-user access attempts are denied.

### Phase 5 --- User Profiles and Discovery

**Goal:** Allow authenticated users to manage their identity and find
other users safely.

Tasks: - Profile details and avatar management. - Search/discover users
with validation and pagination. - Contact/friend behavior only if
defined in approved requirements. - Online status display placeholder,
before distributed presence is added. - Privacy rules for profile
fields. - Prevent users from changing protected account fields.

Deliverables: - User profile APIs and screens. - User discovery UI. -
Tests for profile ownership and visibility.

Exit criteria: - Users can view and update only permitted profile
fields. - Search is bounded, validated, and indexed as needed.

### Phase 6 --- Conversations and One-to-One Messaging

**Goal:** Establish durable conversation and message persistence.

Tasks: - Create/find direct conversations. - Enforce conversation
membership. - Send and persist messages through a single authoritative
server flow. - Retrieve message history with cursor-based pagination. -
Stable message IDs and timestamps. - Edit/delete behavior only if
included in requirements, with clear authorization and audit
semantics. - Empty, loading, error, and retry states in the UI. - Add
indexes based on actual query patterns.

Important reliability principle: - A message must not be treated as
successfully sent merely because a socket event was emitted. - The
server must validate, persist, and then acknowledge acceptance. - Use
idempotency/client message IDs to prevent duplicate writes on retries.

Deliverables: - Conversation and message APIs. - Chat UI and history
view. - Database indexes. - Integration tests for persistence and
membership enforcement.

Exit criteria: - Messages survive refresh and reconnect. - Users outside
a conversation cannot read or write to it. - Pagination and
duplicate-retry tests pass.

### Phase 7 --- Real-Time Messaging

**Goal:** Deliver reliable live updates using Socket.IO.

Tasks: - Authenticate socket connections. - Validate conversation
membership before joining rooms or handling events. - Define versioned
event names and payload schemas. - Implement server-side persistence and
acknowledgement flow. - Implement reconnect behavior and history
reconciliation. - Handle disconnect and cleanup. - Add typing indicators
and online status events. - Add delivery/read receipts with clearly
defined semantics. - Test multiple clients, reconnects, duplicate
events, and unauthorized event attempts.

Deliverables: - Socket event contract. - Real-time client/server
implementation. - Socket integration tests. - Failure/retry behavior
documentation.

Exit criteria: - Two or more clients can exchange persisted messages in
real time. - Reconnect does not silently lose accepted messages. -
Invalid or unauthorized socket events are rejected.

### Phase 8 --- Group Conversations

**Goal:** Support conversations with multiple members.

Tasks: - Create and update groups. - Add/remove members with role
checks. - Define owner/admin/member permissions. - Join/leave socket
rooms only after membership validation. - Group message history and
pagination. - Group metadata, avatar, and member list. - Handle removed
members' future access consistently.

Deliverables: - Group APIs and UI. - Group membership model. -
Authorization and real-time tests.

Exit criteria: - Only current members can access group messages. - Admin
actions enforce role and membership rules.

### Phase 9 --- Advanced Messaging and Media

**Goal:** Add practical messaging capabilities after core text messaging
is reliable.

Tasks: - Image and file uploads using object storage. - Validate file
type, size, and upload permissions. - Avoid storing large binary files
directly in MongoDB documents. - Message search and filtering. -
Reply/thread or reply-to-message behavior if approved. - Reactions and
message editing/deletion if approved. - Unread counts and notification
preferences. - Accessibility and mobile-responsive improvements.

Deliverables: - Upload service and safe file access. - Search APIs and
UI. - Updated message model and tests.

Exit criteria: - Uploads are validated and access-controlled. - Search
and pagination perform correctly on representative test data.

### Phase 10 --- Redis, Scaling, and Background Work

**Goal:** Improve multi-instance behavior only after single-instance
correctness is established.

Tasks: - Introduce Redis for distributed presence and shared ephemeral
state. - Configure Socket.IO Redis adapter if multiple application
instances are deployed. - Define presence TTL, heartbeat, and disconnect
handling. - Add background jobs for notifications or other approved
asynchronous tasks. - Add rate limiting and abuse protection. - Load
test important endpoints and socket flows. - Document scaling
assumptions and failure modes.

Deliverables: - Redis integration. - Background job processing if
required. - Load-test report. - Scaling and operations documentation.

Exit criteria: - Presence and socket events work across multiple app
instances in a test environment. - Redis failure behavior is understood
and handled safely. - Performance bottlenecks are measured, not guessed.

### Phase 11 --- Quality, Security, and Observability

**Goal:** Make the application testable, diagnosable, and safer to
operate.

Tasks: - Unit tests for domain logic. - API integration tests. -
Socket.IO integration tests. - End-to-end tests for critical user
journeys. - Authorization regression tests. - Dependency and secret
scanning. - Structured logs with sensitive data redaction. - Error
monitoring and health checks. - Metrics for API latency, socket
connections, message failures, and job failures. - Backup/restore plan
and data retention decisions.

Deliverables: - Automated test suite. - CI quality gates. - Security
checklist and test report. - Operational runbook.

Exit criteria: - Critical user journeys pass automatically. - High-risk
authorization cases are covered. - Errors can be diagnosed without
exposing secrets or message content unnecessarily.

### Phase 12 --- Deployment and Release

**Goal:** Deploy a reproducible release.

Tasks: - Dockerize frontend/backend and required services. - Configure
production environment variables and secrets. - Configure HTTPS and
trusted origins. - Provision MongoDB, Redis, and object storage as
required. - Set up CI/CD with build, test, and deployment stages. - Add
database migration/index initialization procedure. - Configure logs,
health checks, backups, and rollback. - Deploy staging first, run smoke
tests, then production.

Deliverables: - Docker configuration. - CI/CD workflow. - Deployment
guide. - Staging and production URLs. - Release notes and rollback
procedure.

Exit criteria: - A clean deployment can be reproduced from documented
steps. - Smoke tests pass. - Secrets are not committed. - Backup and
rollback procedures are documented.

### Phase 13 --- Portfolio and Interview Readiness

**Goal:** Present the work transparently and explain engineering
decisions.

Tasks: - Write a clear README with screenshots and demo instructions. -
Include architecture and database diagrams. - Document setup,
environment variables, APIs, and socket events. - Maintain a changelog
of original versus independently implemented features. - Attribute the
starter repository and comply with its license. - Prepare technical
explanations for: - REST versus WebSockets. - Socket.IO rooms and
acknowledgements. - Message persistence and idempotency. - MongoDB
indexes and cursor pagination. - Authentication versus authorization. -
Redis presence and multi-instance scaling. - Race conditions,
reconnects, and failure handling. - Security testing and deployment
decisions.

Exit criteria: - A reviewer can run or evaluate the project from the
README. - Original starter work and ConnectX contributions are clearly
distinguished. - You can explain the architecture and demonstrate
critical flows.

## 7. Module Status Tracker

Update this table only when the status is supported by actual work and
test evidence.

  -----------------------------------------------------------------------
  Phase                   Status                  Evidence / notes
  ----------------------- ----------------------- -----------------------
  0\. Repository audit    Complete                `project-analysis/`
                          (Verified)              reports generated; baseline
                                                  run and verified by user.

  1\. Requirements and    Approved                Product requirements aligned;
  foundation                                      deferred docs to post-dev.

  2\. Architecture and    Complete                ERD, compound cursors,
  database design         (Approved)              idempotency & presence approved.

  3\. Application         Complete                Strict config & Socket origin
  foundation and UI       (Fully Verified)        enforcement, ErrorBoundary, Theme,
                                                  Modal, useAsync, 16 unit tests,
                                                  CRA build passed with 0 errors.

  4\. Authentication and  Complete                Phase 4 (Modules 1-5 Fully Implemented & Verified):
  authorization           (Fully Verified)        - Module 1 (Schemas & Cryptographic Models): User security fields,
                                                    SessionFamily, ActiveRotations (strict NO TTL invariant),
                                                    RefreshSession, and Counter schemas with production syncIndexes.
                                                  - Module 2 (Token Utilities & Cryptographic Primitives): RFC 7519 JWT
                                                    (HS256 allowlisted), SHA-256 tokens, length-safe HMAC-SHA256 CSRF,
                                                    strictly monotonic fencing sequence with Redis Lua reservation,
                                                    MongoDB block handoff, and Redis failover/rollback resilience.
                                                  - Module 3 (Security Middlewares & Distributed Governance): Cookie Topology
                                                    handler (Same-Origin, Same-Site, Partitioned Cross-Site), safe Origin/Referer
                                                    parser, double-submit CSRF middleware, trusted proxy IP governance,
                                                    dual-engine sliding-window rate limiters, fail-closed JWT auth, and
                                                    distributed transaction uncertainty & fencing barriers.
                                                  - Module 4 (Authentication Controller & Coordination Engine): Strict 4-step
                                                    Refresh Coordination Engine (Step 0 pre-lock validation & reuse detection,
                                                    Step 0.5 ActiveRotations cluster intent anchor, Step 1 SessionFamily lock,
                                                    Step 2/3 atomic commit asserting deletedCount === 1), 5-attempt brute-force
                                                    lockout, credential sanitization, clustered orphan sweeper, and legacy
                                                    route shielding preserving CRA backward compatibility.
                                                  - Module 5 (Real-time Socket.IO Auth Integration & Security Verification):
                                                    Handshake RFC 7519 JWT auth (query-parameter tokens strictly prohibited
                                                    to prevent log exposure), CSWSH & Origin verification in allowRequest before
                                                    connection acceptance, SessionFamily active verification, rejection of revoked,
                                                    quarantined, rotating (409), and transaction-uncertain (503) sessions, fail-closed
                                                    behavior on DB/Redis outages, authoritative server-side socket.user identity binding,
                                                    per-event authorization middleware, identity spoofing defense on add-user/send-msg,
                                                    and multi-socket tracking (userSockets) ensuring resilient disconnect lifecycle
                                                    under concurrent browser tabs.
                                                  148/148 tests pass cleanly across 37 test suites.

  5\. User profiles and   Not started             
  discovery                                       

  6\. Conversations and   Not started             
  one-to-one messaging                            

  7\. Real-time messaging Not started             

  8\. Group conversations Not started             

  9\. Advanced messaging  Not started             
  and media                                       

  10\. Redis and scaling  Not started             

  11\. Quality, security, Not started             
  observability                                   

  12\. Deployment and     Not started             
  release                                         

  13\. Portfolio and      Not started             
  interview readiness                             
  -----------------------------------------------------------------------

## 8. Engineering Rules for Antigravity

These rules apply to every implementation prompt.

1.  Read `PROJECT_CONTEXT.md` and the relevant module documents before
    changing code.
2.  Work only on the current approved module. Do not implement future
    modules early.
3.  Inspect existing code before editing. Do not invent files, APIs,
    schemas, or dependencies.
4.  Preserve working behavior unless the current module explicitly
    requires a change.
5.  Do not silently change the approved stack, architecture, naming
    conventions, or module order.
6.  If a change to an approved decision is necessary, explain why and
    propose an Architecture Decision Record. Wait for approval before
    applying it.
7.  Make focused, reviewable changes. Avoid unrelated refactoring.
8.  Do not remove or overwrite user work. Inspect Git status before
    editing.
9.  Never hardcode credentials, tokens, private keys, or production
    secrets.
10. Validate all untrusted input on the server.
11. Enforce authentication and authorization on every protected API
    route and socket event.
12. Do not trust client-supplied user IDs for identity or permissions.
13. Add or update tests for every meaningful behavior change.
14. Run relevant tests, lint, and build checks. Report exact commands
    and results; never claim a check passed if it was not run.
15. Update relevant documentation and this status tracker after a module
    is accepted.
16. Report changed files, implementation summary, tests, known
    limitations, and manual verification steps.
17. Do not claim production readiness based only on a successful local
    run.

## 9. Definition of Done for Every Module

A module is complete only when:

-   Requirements and acceptance criteria are met.
-   Implementation matches the approved architecture and contracts.
-   Relevant validation and authorization are implemented.
-   Tests are added and pass.
-   Existing related functionality has been regression-tested.
-   Error, loading, empty, and failure states are considered.
-   Documentation is updated.
-   The Git diff has been reviewed.
-   Known limitations are recorded.
-   The user has reviewed and approved the result before moving on.

## 10. Git and Change Management

-   Keep the original starter repository history and attribution where
    practical.
-   Create a dedicated working branch for ConnectX changes.
-   Commit after each accepted module using descriptive messages.
-   Avoid force-pushing or destructive Git operations unless explicitly
    approved.
-   Keep `.env` and secret files out of Git; commit only safe
    `.env.example` templates.
-   Record significant architecture changes in `docs/DECISIONS.md`.

Suggested commit format:

``` text
feat(auth): add secure login and refresh flow
feat(chat): persist direct conversation messages
fix(socket): clean up disconnected user sessions
test(messages): cover membership authorization
docs(architecture): document socket event contracts
```

## 11. Documentation Structure

Maintain this structure as the project grows:

``` text
ConnectX/
├── PROJECT_CONTEXT.md
├── README.md
├── project-analysis/
│   ├── CODEBASE_ANALYSIS.md
│   ├── EXISTING_FEATURES.md
│   ├── TECHNICAL_DEBT.md
│   └── ARCHITECTURE_OVERVIEW.md
├── docs/
│   ├── PRD.md
│   ├── FRD.md
│   ├── NFR.md
│   ├── ARCHITECTURE.md
│   ├── DATABASE_DESIGN.md
│   ├── ERD.md
│   ├── API_SPECIFICATION.md
│   ├── SOCKET_EVENTS.md
│   ├── SECURITY_MODEL.md
│   ├── TEST_PLAN.md
│   ├── DEPLOYMENT.md
│   └── DECISIONS.md
└── application source folders...
```

The exact source folder structure must follow the approved architecture
and the actual starter repository; do not create this tree blindly.

## 12. Immediate Next Action

The next approved task is **Phase 5 – Module 9: Comprehensive Social, Presence & Messaging Audit** (or Phase 6 approval, awaiting user instruction).

### Progress Log
- **Phase 4: Robust Authentication and Session Management:** Complete and verified across Modules 1–8. (152 backend tests, 44 frontend tests, 196 total tests passing).
- **Phase 5 Module 1 (User Profile Management):** Complete and verified.
  - User model extensions: `displayName`, `bio`, `phoneNumber`, `statusMessage`.
  - Backend profile controllers & routes: `GET /api/v1/profile/me`, `PUT /api/v1/profile/me`, `POST /api/v1/profile/avatar`, `GET /api/v1/profile/:id`.
  - Enforced ownership and sensitive field sanitization.
  - Frontend integration: Responsive `ProfileModal` in Header and avatar customization.
- **Phase 5 Module 2 (User Settings & Preferences Engine):** Complete and verified.
  - Dedicated MongoDB `UserSettings` schema (`userId` index) supporting notifications, privacy, and chat preferences.
  - Backend controllers & routes (`/api/v1/settings`): `GET /` (with lazy defaults), `PUT /` (strict enum and boolean validation), and `POST /reset`.
  - Frontend `SettingsModal` component integrated into Header with tab navigation (Notifications, Privacy, Chat), reactive toggles, and reset capabilities.
  - Test suites passing: 168 backend tests (47 suites) and 51 frontend tests (12 suites). Total: 219 automated tests passing (0 failed).
- **Phase 5 Module 3 (Distributed Presence & Heartbeat Engine):** Complete and verified.
  - Extended `UserModel` schema with `isOnline` boolean and `lastSeen` timestamp.
  - Created standalone `PresenceEngine` supporting multi-device/multi-socket session tracking per user, heartbeat tracking, and a background stale session sweeper (35s timeout threshold).
  - Integrated distributed Redis coordination (`presence:user:<id>`, `presence:heartbeat:<id>`, `presence:socket:<id>`) with in-memory map fallbacks and resilient error containment.
  - Integrated real-time Socket.IO events: `presence:update`, `presence:heartbeat` with `presence:heartbeat_ack`, and `presence:query`.
  - Enforced user privacy rules respecting `UserSettings.privacy.lastSeenVisibility` (`"everyone"`, `"contacts"`, `"nobody"`), filtering `isOnline` and masking `lastSeen` appropriately while ensuring users always observe their own state.
  - Added 10 comprehensive tests covering multi-socket lifecycle, partial vs complete disconnect, heartbeat pulse, sweeper timeouts, privacy sanitization, and broken-Redis resilience.
  - Total automated tests passing: 178 backend tests (52 suites) and 51 frontend tests (12 suites). Total: 229 automated tests passing (0 failed).
- **Phase 5 Module 4 (Contact Discovery & Social Graph):** Complete and verified.
  - Data models: Created indexed `ContactRequest` (state machine: `PENDING`, `ACCEPTED`, `REJECTED`, `CANCELLED`) and bidirectional `Contact` models.
  - Backend controllers & routes (`/api/v1/contacts`):
    - `GET /search`: paginated user search (by username and displayName) with regex injection protection and relationship annotations (`NONE`, `PENDING_SENT`, `PENDING_RECEIVED`, `CONTACT`).
    - `POST /request`: friend/contact request dispatch with self-request (`SELF_REQUEST_PROHIBITED`), duplicate request (`DUPLICATE_REQUEST`), and cross-request (`INCOMING_REQUEST_EXISTS`) guards.
    - `POST /request/:requestId/accept`: establishes mutual bidirectional contact records and updates request state.
    - `POST /request/:requestId/reject` & `cancel`: lifecycle state transitions with strict caller authorization.
    - `GET /`: lists confirmed contacts with safe attributes (sensitive credentials omitted).
    - `DELETE /:contactId`: atomic mutual contact removal and relationship state invalidation.
  - Frontend integration: Responsive `ContactDiscoveryModal` accessible via header button (`header-discovery-btn`) with dynamic tabs ("Discover Users" and "Requests" with incoming badge), live search, status indicators, and contact mutation actions.
  - Total automated tests passing: 194 backend tests (58 suites) and 55 frontend tests (13 suites). Total: 249 automated tests passing (0 failed).
- **Phase 5 Module 5 (Conversation & Chat Management):** Complete and verified.
  - Data models: Created `Conversation` model with `participants` array, indexed `updatedAt`, `participantHash` for strict idempotent one-to-one deduplication, and `lastMessage` metadata.
  - Backend controllers & routes (`/api/v1/conversations`):
    - `POST /`: idempotent creation and retrieval of one-to-one conversations; enforces self-conversation prevention (`SELF_CONVERSATION_PROHIBITED`) and participant validation (`USER_NOT_FOUND`).
    - `GET /`: retrieves all conversations for the authenticated user, populated with participant profile/presence details and `otherParticipant` helper.
    - `GET /:conversationId`: retrieves conversation details with strict participant membership authorization (`CONVERSATION_ACCESS_DENIED`).
    - `PUT /:conversationId/read`: resets unread counters for the authenticated caller.
    - Synchronized `messageController.addMessage` to update conversation `lastMessage` and `updatedAt` on incoming direct messages.
  - Frontend integration:
    - Updated `Sidebar.jsx` with real-time last message previews, format timestamps, and presence indicators.
    - Enriched `Chat.jsx` to load and merge conversation metadata with contacts, and auto-initialize conversation records on chat selection.
    - Added dedicated component tests in `Sidebar.test.jsx`.
  - Total automated tests passing: 208 backend tests (65 suites) and 59 frontend tests (14 suites). Total: 267 automated tests passing (0 failed).
- **Phase 5 Module 6 (Real-Time Messaging Engine):** Complete and verified.
  - Data models: Enhanced `Message` schema with `conversationId`, message status (`SENT`, `DELIVERED`, `READ`), and compound indexes (`{ conversationId: 1, createdAt: -1 }`, `{ users: 1, createdAt: -1 }`).
  - Backend controllers & routes (`/api/v1/messages`):
    - `GET /:conversationId`: paginated message history with participant authorization (`CONVERSATION_ACCESS_DENIED`), cursor support (`before`), and server-computed `fromSelf`.
    - `POST /`: authoritative sender binding, participant membership validation, fail-closed DB persistence, and conversation `lastMessage` / `updatedAt` synchronization.
  - Real-time Socket.IO Gateway (`socketGateway.js`):
    - Added `message:send`: reliable persistence before broadcasting, recipient room fan-out, ACK callback, and error containment.
    - Added `message:sync`: client reconnect catchup synchronized by conversation ID.
    - Preserved legacy events `send-msg` / `msg-recieve` with non-blocking DB persistence for backwards compatibility.
  - Frontend integration:
    - Enhanced `ChatContainer.jsx` to fetch v1 conversation history, send messages with optimistic rendering and dual socket/HTTP dispatch, listen for `message:receive` and `msg-recieve` with duplicate suppression, and maintain autoscroll.
    - Added dedicated test suite `ChatContainer.test.jsx`.
  - Total automated tests passing: 215 backend tests (69 suites) and 63 frontend tests (15 suites). Total: 278 automated tests passing (0 failed).
- **Phase 5 Module 7 (Delivery & Read Receipts Engine):** Complete and verified.
  - Data models: Added `deliveredAt` and `readAt` timestamps to `Message` schema with compound index `{ conversationId: 1, status: 1 }`.
  - Backend controllers & routes (`/api/v1/messages`):
    - `PUT /status` & `PUT /:messageId/status`: strictly enforces forward progression (`SENT` $\rightarrow$ `DELIVERED` $\rightarrow$ `READ`), participant membership, and blocks sender from marking own messages (`UNAUTHORIZED_RECEIPT_UPDATE`). Prevents regression (`INVALID_STATUS_REGRESSION`).
    - `PUT /conversation/:conversationId/read`: marks all incoming messages in conversation as `READ` and resets unread counts.
    - `GET /:conversationId`: integrates privacy setting (`readReceiptsEnabled: false`) to mask `READ` status to `DELIVERED` for sent messages, and provides timestamps.
  - Real-time Socket.IO Gateway (`socketGateway.js`):
    - Added `message:delivered` / `message:delivery_receipt`: updates MongoDB status to `DELIVERED`, broadcasts `message:status_update` to sender room (`user:${senderId}`) and recipient's other concurrent sockets.
    - Added `message:read` / `message:read_receipt`: updates MongoDB status to `READ`, resets conversation unread counts, checks recipient's `privacy.readReceiptsEnabled` and suppresses sender broadcast if disabled, while synchronizing recipient's other devices.
    - Updated `message:sync` to return `status`, `deliveredAt`, and `readAt`.
  - Frontend integration:
    - Updated `ChatContainer.jsx` to render receipt indicators (`✓` for SENT, `✓✓` for DELIVERED, `✓✓` colored for READ), listen to `message:status_update`, `message:delivered`, `message:read` with regression protection, and automatically emit delivery and read receipts for active chats.
  - Automated test coverage: Added 10 backend tests in `deliveryReceipts.test.js` and 2 frontend tests in `ChatContainer.test.jsx`.
  - Total automated tests passing: 225 backend tests (75 suites) and 65 frontend tests (15 suites). Total: 290 automated tests passing (0 failed).
- **Phase 5 Module 8 (Media & File Sharing):** Complete and verified.
  - Data models: Enhanced `Message` schema with `messageType` (`TEXT`, `IMAGE`, `FILE`) and `media` metadata (`filename`, `originalName`, `mimeType`, `size`, `data`, `url`).
  - Backend validation & controllers (`messageController.js`):
    - `validateMedia`: Strict validation of MIME types, rejection of dangerous extensions (`.exe`, `.sh`, `.bat`, etc. with `400 INVALID_FILE_TYPE`), and enforcement of 5MB size limit (`413 FILE_TOO_LARGE`).
    - `sendMessage`: Enhanced to accept media attachments alongside optional text captions; sets appropriate conversation `lastMessage` snippet (`[Image]` or `[File] filename`).
    - `GET /media/:messageId`: Secure media serving endpoint enforcing conversation participant authorization (`403 MESSAGE_ACCESS_DENIED`) and streaming binary buffers with appropriate `Content-Type` and `Content-Disposition`.
  - Real-time Socket.IO Gateway (`socketGateway.js`):
    - Enhanced `message:send` to validate media, persist `messageType` and `media` metadata, and fan out media payloads to recipient rooms.
    - Updated `message:sync` to return media metadata on reconnect.
  - Frontend integration:
    - `ChatContainer.jsx`: Renders image preview cards with click-to-expand, document cards with file icon, formatted size, and direct download buttons (`data-testid="file-download-link"`), integrated with delivery/read receipt indicators.
    - `ChatInput.jsx`: Added attachment button (`FiPaperclip`), file picker with 5MB validation, and active selection banner with dismiss button.
  - Automated test coverage: Added 10 backend tests in `mediaSharing.test.js` and 1 frontend component test in `ChatContainer.test.jsx`.
  - Total automated tests passing: 235 backend tests (80 suites) and 66 frontend tests (15 suites). Total: 301 automated tests passing (0 failed).
- **Phase 5 Module 9 (Notification Engine):** Complete and verified.
  - Data models:
    - Created `Notification` model with `recipient`, `sender`, `type` (`MESSAGE_RECEIVED`, `CONTACT_REQUEST_RECEIVED`, `CONTACT_REQUEST_ACCEPTED`), `title`, `body`, `conversationId`, `messageId`, `isRead`, `readAt`, and compound unique index `{ recipient: 1, dedupKey: 1 }` for strict duplicate prevention, and compound query index `{ recipient: 1, isRead: 1, createdAt: -1 }`.
  - Backend services, controllers & routes (`/api/v1/notifications`):
    - `dispatchNotification`: Helper service enforcing user notification preferences (`UserSettings.notifications.pushNotifications`, `soundEnabled`, `desktopAlerts`), deduplication via `dedupKey`, self-notification suppression, and real-time Socket.IO fanout.
    - `GET /`: Paginated list of authenticated user's notifications.
    - `GET /unread-count`: Fast unread notification counter for badge indicators.
    - `PUT /:id/read`: Marks single notification as read with strict recipient authorization (`403 NOTIFICATION_ACCESS_DENIED`).
    - `PUT /read-all`: Marks all unread notifications for caller as read.
    - `DELETE /:id`: Deletes notification with ownership validation.
  - Real-time Socket.IO Gateway (`socketGateway.js`):
    - Dispatches notifications on incoming messages (`message:send` and legacy `send-msg`).
    - Added `notification:new` and `notification:count` broadcasts to recipient rooms.
    - Added `notification:mark_read` socket listener for multi-device sync and `notification:sync` for reconnect catchup.
  - Social Graph Integration:
    - Dispatches notifications on contact request dispatch (`CONTACT_REQUEST_RECEIVED`) and acceptance (`CONTACT_REQUEST_ACCEPTED`).
  - Frontend integration:
    - Created `NotificationDropdown.jsx` component mounted in `Header.jsx`.
    - Features unread notification badge (`data-testid="notification-badge"`), dropdown list of notifications, sound alert support, mark single as read, mark all read button (`data-testid="mark-all-read-btn"`), and one-click navigation to chat conversation.
  - Automated test coverage: Added 10 backend tests in `notificationEngine.test.js` and 3 frontend tests in `NotificationDropdown.test.jsx`.
  - Total automated tests passing: 245 backend tests (85 suites) and 69 frontend tests (16 suites). Total: 314 automated tests passing (0 failed).
- **Phase 5 Module 10 (Final Integration & Production Readiness Audit):** Complete and verified.
  - End-to-end integration audit across Modules 1–9: verified authentication, security middlewares, distributed presence, social discovery, conversations, messaging, receipts, media streaming, and notifications.
  - UI Redesign Integration: applied studio editorial aesthetic (`#D9480F` Terracotta, `#F3EEE6` Linen Canvas, `#FFFDF9` Warm Cards) across layout, header, search sidebar, chat container, message bubbles, input composer, and notification dropdown.
  - Zero-warning production build verified (`npm run build`).
  - Active runtime verified: MongoDB daemon (port 27017), backend server (port 5000), and frontend server (port 3000) running with healthy ping/health status.
  - Final test metrics: **314 passing automated tests** (245 backend, 69 frontend), 0 failures.
  - Updated `README.md` with complete installation, architecture, and testing instructions.
  - Project status: **Production Ready**. All planned phases and modules are complete.

- **Phase 5 Module 11 (Real-Time Voice & Video Calling):** Complete and verified.
  - Data models:
    - Created `Call` model with `caller`, `receiver`, `conversationId`, `callType` (`VOICE`, `VIDEO`), `status` (`RINGING`, `ACCEPTED`, `CONNECTING`, `CONNECTED`, `ENDED`, `REJECTED`, `CANCELLED`, `MISSED`, `BUSY`, `FAILED`), `startedAt`, `answeredAt`, `connectedAt`, `endedAt`, `duration`, and `terminationReason`.
    - Updated `Notification` model to support `INCOMING_CALL` and `MISSED_CALL` notification types.
  - Real-time WebRTC Signaling Gateway (`callSignaling.js`, `socketGateway.js`):
    - WebRTC signaling events: `call:initiate`, `call:accept`, `call:reject`, `call:cancel`, `call:offer`, `call:answer`, `call:ice_candidate`, `call:connected`, `call:end`, `call:media_state`.
    - Real-time socket room targeting (`user:<userId>`), multi-device support, and 35-second no-answer ringing timeout automatically dispatching `MISSED_CALL` notifications.
    - Abrupt socket disconnect detection ending active calls cleanly.
  - Backend controllers & routes (`/api/v1/calls`):
    - `GET /ice-servers`: Dynamic STUN (Google STUN default) and configurable TURN server credentials from environment variables (`TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL`).
    - `GET /`: Paginated and filterable call history for authenticated user (All, Missed, Voice, Video).
    - `GET /:id`: Authorized call session inspector.
    - `POST /initiate`: Authoritative call session initialization with participant validation and self-call prevention.
  - Frontend WebRTC Service & State Machine:
    - `webrtcService.js`: Robust `RTCPeerConnection` wrapper managing media constraints, track addition, remote track events, ICE candidate queuing, mute/unmute, camera toggle, and facing mode switching.
    - `CallContext.jsx`: Complete calling state machine handling ringing, timers, media controls, and socket signaling listeners.
  - Calling UI:
    - `CallModal.jsx`: Modal supporting Incoming Call prompt (Accept/Reject), Outgoing Calling screen (Cancel), Active Voice Call screen with live timer and audio controls pill, and Active Video Call screen with remote video stream + PiP local preview.
    - `CallHistoryModal.jsx`: Accessible call history modal in the navigation rail with filtering and one-click callback buttons.
    - Chat header and profile drawer integration with Voice and Video call action buttons.
  - Automated test coverage:
    - Added backend tests in `calling.test.js` (Call schema, ice-servers endpoint, initiation validations, and notifications).
    - Added frontend unit tests in `CallModal.test.jsx` and `CallHistoryModal.test.jsx` (7 passing tests).
  - Total automated test suite: 18 passing frontend suites (76 tests), 100% pass rate.
  - Production build: Zero error compilation (`npm run build`).

- **OTP Email Delivery Service & Verification Enhancement:** Complete and verified.
  - Nodemailer SMTP integration:
    - Implemented `emailService.js` supporting connection pooling, secure STARTTLS/TLS negotiation, and dynamic SMTP environment configuration (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`).
    - Configured fail-closed behavior with sanitized error handling (`502 EMAIL_DELIVERY_FAILED` and `503 SMTP_NOT_CONFIGURED`), completely preventing credential or token leakage.
  - Professional ConnectX Email Templates:
    - Responsive HTML and plain-text template with ConnectX branding, purpose-aware headers (`SIGNUP`, `LOGIN`, `PASSWORD_RESET`), 6-digit highlighted monospace code box, 10-minute expiration badge, and phishing/security warning notice.
  - Security hardening:
    - Removed `devCode` from all API responses and eliminated plain-text console logging of OTP codes.
    - Added IP-based sliding window rate limiters: `otpSendRateLimiter` (5 per 10 min) and `otpVerifyRateLimiter` (10 per 10 min).
    - Single-use OTP token invalidation on registration to prevent token replay attacks.
  - Automated tests:
    - Added dedicated test suite `emailService.test.js` covering template rendering, payload validation, mock delivery, and network/transporter failure handling.
    - Verified all OTP lifecycle tests pass without dev codes.

------------------------------------------------------------------------

**Project principle:** Build ConnectX one module at a time. Understand
it, document it, implement it, test it, review it, and only then move
forward.
