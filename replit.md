# Instagram AI Response System

## Overview
This project is an automated response system for Instagram DMs and comments, leveraging Artificial Intelligence. Its core purpose is to streamline interaction management for Instagram business accounts, offering AI-generated responses with a human approval workflow, dual authentication, and continuous learning capabilities. The system aims to enhance efficiency, maintain brand voice, and provide timely customer engagement on Instagram.

## User Preferences
- Language: Portuguese (Brazil)
- Design: Modern dashboard style inspired by Linear, Notion, Vercel
- **Default behavior**: All changes, updates, and new features must be applied to ALL users (admin and regular users) equally. This is a system-wide update.
- **Exception**: Only apply changes to a specific user type (admin-only or user-only) when explicitly requested in the prompt.
- **Rationale**: System improvements and updates benefit all users uniformly unless otherwise specified.

## System Architecture

### Multi-User Data Isolation
The system provides robust multi-user data isolation, ensuring each user operates within their independent environment. This includes per-user settings for operation mode, auto-approve thresholds, AI tone, and context. All dashboard statistics and message queues are filtered by `userId`, preventing data leakage between users. Messages sent by the user themselves are excluded from their approval queues. An admin panel allows for manual Instagram ID assignment and management.

### Core Features
- **Dashboard**: Provides key statistics like pending messages, approved responses, auto-sent messages, and average AI confidence.
- **Approval Queue**: Features a split-view modal for efficient human review and approval of AI-generated responses, with message cards displaying confidence indicators.
- **History**: A tabular view of all processed messages.
- **Settings**: Configurable sections for Instagram connection, operation modes (Manual, Semi-Automatic), and AI settings.
- **AI Learning**: Incorporates human corrections to continuously improve AI response quality.
- **Media Support**: Handles various media types (photos, videos, audio, GIFs, reels, stickers, drawings) in DMs.
- **Comment Context**: Comments are grouped by post, displaying the original post's thumbnail, caption, and full comment thread. Replies to comments show parent comment details.
- **Knowledge Base**: Allows training the AI with external links and file uploads (PDF, TXT) to provide specific context for responses.
- **Authentication & Authorization**: Supports Replit Auth (Google, GitHub, Apple) and email/password. Implements role-based access control (RBAC) with admin and regular user roles, ensuring data segregation and administrative oversight. An admin panel enables user management and Instagram account monitoring.
- **Security**: Features include password hashing (bcrypt), server-side `userId` injection, AES-256-GCM encryption for sensitive tokens, API response sanitization, log redaction, and CSRF protection for OAuth flows.

### Technical Stack
- **Frontend**: React, TypeScript, TailwindCSS, Shadcn UI, Wouter, TanStack Query
- **Backend**: Express.js, TypeScript
- **Database**: PostgreSQL (Drizzle ORM)
- **AI**: OpenAI GPT (via Replit AI Integrations)
- **Auth**: Replit Auth (OIDC), bcrypt

### Database Tables
- `users`: User accounts with Instagram details.
- `sessions`: Authentication session storage.
- `instagram_messages`: Instagram DMs and comments.
- `ai_responses`: AI-generated response data.
- `learning_history`: Records of human corrections.
- `settings`: System configuration.

### API Endpoints
The system provides comprehensive API endpoints for authentication, message management (fetching, approving, rejecting, regenerating), user-specific settings, and admin functionalities including user management and webhook status.

## External Dependencies

- **Meta Graph API (Instagram)**: For direct messaging, comment replies, user profile information, and webhook integration to receive real-time updates.
- **OpenAI GPT**: Utilized for AI response generation, integrated via Replit AI Integrations.
- **Replit Auth**: Provides social login capabilities (Google, GitHub, Apple) for user authentication.
- **cheerio**: Used for extracting text content from web pages for the AI knowledge base.
- **pdf-parse**: Used for extracting text content from PDF files for the AI knowledge base.
- **Replit Object Storage**: For storing uploaded training files (PDFs, TXTs).
- **PostgreSQL**: The primary relational database for all application data.
- **bcrypt**: For secure password hashing.