# Instagram AI Response System

## Overview
Sistema automatizado de respostas para DMs e comentários do Instagram usando Inteligência Artificial, com fluxo de aprovação humana e aprendizado contínuo.

## Current State
- **Status**: MVP Completo
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

### Technical Stack
- **Frontend**: React, TypeScript, TailwindCSS, Shadcn UI, Wouter (routing), TanStack Query
- **Backend**: Express.js, TypeScript
- **Database**: PostgreSQL (Drizzle ORM)
- **AI**: OpenAI GPT via Replit AI Integrations

## Project Architecture

### Directory Structure
```
├── client/src/
│   ├── components/      # Reusable UI components
│   ├── pages/           # Page components (Dashboard, Queue, History, Settings)
│   ├── hooks/           # Custom React hooks
│   └── lib/             # Utilities
├── server/
│   ├── routes.ts        # API endpoints
│   ├── storage.ts       # Database operations
│   ├── openai.ts        # OpenAI integration with retry logic
│   └── db.ts            # Database connection
└── shared/
    └── schema.ts        # Database schema and types
```

### Database Tables
- `instagram_messages`: DMs and comments from Instagram
- `ai_responses`: AI-generated responses with confidence scores
- `learning_history`: Human corrections for AI learning
- `settings`: System configuration

### API Endpoints
- `GET /api/stats` - Dashboard statistics
- `GET /api/messages` - All messages
- `GET /api/messages/pending` - Pending messages
- `GET /api/messages/recent` - Recent messages
- `POST /api/messages/:id/approve` - Approve response
- `POST /api/messages/:id/reject` - Reject response
- `POST /api/messages/:id/regenerate` - Regenerate AI response
- `GET/PATCH /api/settings` - System settings
- `POST /api/seed-demo` - Seed demo data (dev only)

## User Preferences
- Language: Portuguese (Brazil)
- Design: Modern dashboard style inspired by Linear, Notion, Vercel

## Notes
- Instagram API integration is simulated for development
- Real Instagram integration requires Facebook Developer App approval
- AI uses pRetry for robust error handling with rate limit retries
