# Instagram AI Response System

## Overview
Sistema automatizado de respostas para DMs e comentários do Instagram usando Inteligência Artificial, com fluxo de aprovação humana, autenticação dual e aprendizado contínuo.

## Current State
- **Status**: MVP Completo com Isolamento Multi-Usuário
- **Last Updated**: Janeiro 2026

### Multi-User Data Isolation
- **Per-User Settings**: Each user has independent operationMode, autoApproveThreshold, aiTone, and aiContext stored in their user record
- **Settings API**: GET/PATCH /api/settings reads/writes to user-specific fields, not global settings
- **Webhook Processing**: Comment and DM webhooks use user-specific operation modes and confidence thresholds for auto-send decisions
- **Statistics**: Dashboard avgConfidence and all stats are filtered by userId (admins see all, users see own)
- **User Indicator**: Sidebar displays user name, email, and role (Administrador/Usuário)
- **Own Sent Message Filter**: Messages where senderId matches ANY of the user's Instagram IDs (instagramAccountId OR instagramRecipientId) are excluded from all queries (pending, recent, history). Users never see messages they sent in their own approval queues - only messages they received. The system collects both IDs into an `excludeSenderIds[]` array because Instagram uses different IDs in different contexts (Graph API vs DM webhooks).
- **NULL Sender ID Handling**: Comment messages may have NULL senderId. Storage queries use `or(isNull(senderId), and(ne(senderId, id1), ne(senderId, id2)...))` pattern to correctly include these messages while excluding the user's own messages (SQL NULL comparisons return NULL, not TRUE).

## Features

### MVP Features
- Dashboard com estatísticas (mensagens pendentes, aprovadas, auto-enviadas, confiança média)
- Fila de aprovação com cards de mensagens e modal de aprovação split-view
- Histórico de todas as mensagens processadas em formato de tabela
- Configurações com abas para conexão, modo de operação e configuração da IA
- Indicadores de confiança da IA com badges coloridos
- Modos: Manual (100% aprovação) e Semi-Automático (90% auto, 10% revisão)
- Sistema de aprendizado que armazena correções humanas
- Regenerar resposta da IA
- Tema claro/escuro
- Seletor de emojis no modal de aprovação
- **Suporte a mídia**: Fotos, vídeos, áudios, GIFs, reels, stickers e desenhos recebidos via DM

### Instagram Integration (Meta Graph API)
- **Centralized App Configuration**:
  - Uses environment variables: `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`
  - Single Facebook App for all users (centralized architecture)
  - Webhook token: `WEBHOOK_VERIFY_TOKEN` for Meta webhook verification
- **User Instagram Connection**:
  - OAuth 2.0 flow via Instagram Business Login
  - Access tokens stored per-user in database (instagramAccessToken, instagramAccountId)
  - `instagramRecipientId` field stores the webhook recipient ID for reliable matching
  - `instagramProfilePic` field stores profile picture URL during OAuth for cross-account lookups
  - Users can connect/disconnect their Instagram Business accounts
- **Token Refresh System**:
  - Long-lived tokens expire in 60 days (5184000 seconds from Meta API)
  - Database fields: `tokenExpiresAt`, `tokenRefreshedAt`, `refreshAttempts`, `lastRefreshError`, `showTokenWarning`
  - Automatic refresh: Daily cron job (3am) refreshes tokens expiring within 7 days
  - Uses Instagram Graph API endpoint `/refresh_access_token` for renewal
  - Retry mechanism: Up to 2 attempts before showing warning banner
  - UI Warning: Yellow banner in sidebar when `showTokenWarning=true`, links to Settings
  - OAuth callback calculates and saves `tokenExpiresAt` (current time + 60 days)
  - CRITICAL: Expired tokens prevent Meta from delivering webhooks to user's account
- **Profile Data Caching**:
  - During OAuth callback, fetches and stores username + profile_picture_url
  - Webhook processing checks if sender matches a known user's Instagram account
  - Uses cached profile data when API lookups fail due to cross-account permissions
  - Handles case where User A (business account) messages User B, but B's token can't look up A's profile
- **Webhooks (Real-time Updates)**:
  - Endpoint: `GET/POST /api/webhooks/instagram`
  - Signature verification using X-Hub-Signature-256 (HMAC-SHA256)
  - Subscribed fields: comments, mentions, messages
  - Multi-step user matching: by instagramAccountId, then by instagramRecipientId
  - **Outgoing Message Filter (Multi-layer)**:
    - Skip `is_echo=true` messages (Instagram echo flag for sent messages)
    - Skip if `senderId === recipientId` (self-messages)
    - Skip if `entryId === senderId` (webhook account sent the message - echo without flag)
    - Existing check: sender matches recipient's Instagram account IDs
  - **Sender Profile Resolution**: 
    - Checks if sender matches a known user's Instagram account
    - Uses sender's own token to fetch profile picture (most reliable for cross-account)
    - Falls back to recipient's token, then API lookup
    - Auto-updates instagramProfilePic cache when photo is fetched
  - **Secure Auto-association**: 
    - Stores `pending_webhook_{userId}` marker during OAuth with timestamp
    - Only auto-associates if webhook arrives within 15-minute window from OAuth
    - One-time marker deleted after successful association
    - Multiple eligible users require admin intervention (no auto-association)
    - Periodic cleanup of expired markers (startup + every hour)
  - Clears unmapped webhook alert after successful auto-association
  - Falls back to admin notification only when no eligible users found or window expired
- **API Endpoints**:
  - `GET /api/instagram/auth` - Initiates OAuth flow
  - `GET /api/instagram/callback` - OAuth callback handler
  - `POST /api/instagram/disconnect` - Disconnect Instagram account
  - `POST /api/instagram/sync` - Manual sync of messages/comments
  - `GET /api/webhooks/config` - Get webhook configuration info (admin only)

### Authentication System
- **Social Login (Primary)**:
  - Replit Auth (Google, GitHub, Apple) - Available for all users
  - New users created via social login are regular users (isAdmin: false)
- **Email/Password (Alternative)**:
  - Available as collapsible option on login page
  - Users can register with email/password
- **Admin Preservation**:
  - Existing admins keep their status when switching auth methods
  - Email lookup ensures admin privileges are preserved
- **Role-Based Access Control**:
  - Admins see all messages from all users
  - Regular users see only their own messages
- **Admin Panel** (/admin):
  - View all registered users with delete functionality
  - Promote/demote admin privileges
  - Self-demotion/deletion protection
  - Instagram accounts tab with webhook ID management
  - Alert for unmapped webhooks with recipient ID display
  - **Manual Instagram Data Refresh**: Admin can click "Atualizar" to refresh username/profile pic from Instagram API
    - Tries multiple API approaches: graph.instagram.com/me, graph.facebook.com/{id}, graph.instagram.com/{id}
    - When all APIs fail (expired token), sets showTokenWarning=true and shows "Token Expirado" status
    - UI updates immediately via query invalidation on both success and error
  - Only visible to admins in sidebar
- **Session Management**: 
  - actualUserId stored for users with existing email accounts
  - Token refresh for OIDC sessions
- **Instagram OAuth Security**:
  - Database-backed nonce storage for CSRF protection
  - HMAC-SHA256 signed state parameter (no session fallback)
  - Single-use nonces with automatic deletion after use
  - 1-hour expiry with periodic cleanup of stale entries
  - Strict validation: no state = no connection (no fallback paths)
- **Security**:
  - Password hashing with bcrypt
  - userId injection on server-side
  - AES-256-GCM encryption for sensitive tokens (instagramAccessToken, facebookAppSecret)
  - API response sanitization (removes password, tokens, secrets from responses)
  - Log redaction system to prevent credential exposure in server logs
  - Requires SESSION_SECRET environment variable for encryption

### Technical Stack
- **Frontend**: React, TypeScript, TailwindCSS, Shadcn UI, Wouter (routing), TanStack Query
- **Backend**: Express.js, TypeScript
- **Database**: PostgreSQL (Drizzle ORM)
- **AI**: OpenAI GPT via Replit AI Integrations
- **Auth**: Replit Auth (OIDC) for admins, bcrypt for regular users

## Project Architecture

### Directory Structure
```
├── client/src/
│   ├── components/      # Reusable UI components (app-sidebar, approval-modal, etc.)
│   ├── pages/           # Page components (Dashboard, Queue, History, Settings, Login)
│   ├── hooks/           # Custom React hooks
│   └── lib/             # Utilities
├── server/
│   ├── routes.ts        # API endpoints with auth protection
│   ├── storage.ts       # Database operations
│   ├── openai.ts        # OpenAI integration with retry logic
│   ├── db.ts            # Database connection
│   ├── encryption.ts    # AES-256-GCM token encryption
│   └── replit_integrations/auth/  # Replit Auth integration
└── shared/
    ├── schema.ts        # Database schema and types
    └── models/auth.ts   # Auth type definitions
```

### Database Tables
- `users`: User accounts (id, email, password, firstName, lastName, isAdmin, instagramAccountId, etc.)
- `sessions`: Session storage for authentication
- `instagram_messages`: DMs and comments from Instagram (with userId for ownership, mediaUrl, mediaType)
- `ai_responses`: AI-generated responses with confidence scores
- `learning_history`: Human corrections for AI learning
- `settings`: System configuration

### API Endpoints

#### Authentication
- `GET /api/auth/user` - Get current authenticated user
- `POST /api/auth/login` - Login with email/password
- `POST /api/auth/logout` - Logout
- `POST /api/auth/register` - Register new user
- `GET /login/replit` - Initiate Replit OIDC login (admin)
- `GET /login/replit/callback` - Replit OIDC callback

#### Messages (Protected - requires authentication)
- `GET /api/stats` - Dashboard statistics (scoped by user role)
- `GET /api/messages` - All messages (admin: all, user: own)
- `GET /api/messages/pending` - Pending messages
- `GET /api/messages/recent` - Recent messages
- `POST /api/messages` - Create new message (userId auto-injected)
- `POST /api/messages/:id/approve` - Approve response
- `POST /api/messages/:id/reject` - Reject response
- `POST /api/messages/:id/regenerate` - Regenerate AI response

#### Settings (Protected)
- `GET/PATCH /api/settings` - System settings

#### Admin (Protected - admin only)
- `GET /api/admin/user-stats` - Get per-user message statistics
- `DELETE /api/admin/users/:userId` - Delete user and their messages
- `PATCH /api/admin/users/:userId/instagram` - Update user's Instagram recipient ID
- `GET /api/admin/webhook-status` - Get last unmapped webhook info
- `DELETE /api/admin/webhook-status` - Clear unmapped webhook alert

#### Development
- `POST /api/seed-demo` - Seed demo data (dev only)

## User Preferences
- Language: Portuguese (Brazil)
- Design: Modern dashboard style inspired by Linear, Notion, Vercel

### Development Guidelines
- **Default behavior**: All changes, updates, and new features must be applied to ALL users (admin and regular users) equally. This is a system-wide update.
- **Exception**: Only apply changes to a specific user type (admin-only or user-only) when explicitly requested in the prompt.
- **Rationale**: System improvements and updates benefit all users uniformly unless otherwise specified.

## Notes
- Instagram API integration via Meta Graph API (DMs and comment replies)
- Real Instagram integration requires Facebook Developer App approval
- AI uses pRetry for robust error handling with rate limit retries
- 401 errors on /api/auth/user when not logged in are expected behavior
- Tokens encrypted with AES-256-GCM; backward compatible with unencrypted legacy tokens
- **IMPORTANT: Production and Development use SEPARATE databases** - User IDs and admin status are independent. Admin panel changes in dev don't affect production and vice versa.
