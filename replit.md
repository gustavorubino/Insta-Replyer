# Instagram AI Response System

## Overview
Sistema automatizado de respostas para DMs e comentários do Instagram usando Inteligência Artificial, com fluxo de aprovação humana, autenticação dual e aprendizado contínuo.

## Current State
- **Status**: MVP Completo com Autenticação Dual
- **Last Updated**: Janeiro 2026

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

### Authentication System
- **Dual Authentication**:
  - Admin: Login via Replit Auth (OIDC) - isAdmin: true
  - Regular Users: Email/password with bcrypt - isAdmin: false
- **Role-Based Access Control**:
  - Admins see all messages from all users
  - Regular users see only their own messages
- **Registration**: Users can create accounts with email/password
- **Session Management**: Token refresh for Replit admin sessions
- **Security**: Password hashing with bcrypt, userId injection on server-side

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
│   └── replit_integrations/auth/  # Replit Auth integration
└── shared/
    ├── schema.ts        # Database schema and types
    └── models/auth.ts   # Auth type definitions
```

### Database Tables
- `users`: User accounts (id, email, password, firstName, lastName, isAdmin, instagramAccountId, etc.)
- `sessions`: Session storage for authentication
- `instagram_messages`: DMs and comments from Instagram (with userId for ownership)
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

#### Development
- `POST /api/seed-demo` - Seed demo data (dev only)

## User Preferences
- Language: Portuguese (Brazil)
- Design: Modern dashboard style inspired by Linear, Notion, Vercel

## Notes
- Instagram API integration is simulated for development
- Real Instagram integration requires Facebook Developer App approval
- AI uses pRetry for robust error handling with rate limit retries
- 401 errors on /api/auth/user when not logged in are expected behavior
