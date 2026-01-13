# Design Guidelines: Instagram AI Response Management System

## Design Approach
**System-Based Approach** using modern dashboard patterns inspired by Linear, Notion, and Vercel's admin interfaces. This utility-focused application prioritizes efficiency, clarity, and workflow optimization over visual flourish.

## Core Design Principles
1. **Information Clarity**: Dense data displays with clear visual hierarchy
2. **Workflow Efficiency**: Minimize clicks and cognitive load in approval processes
3. **Status Transparency**: Clear visual indicators for AI confidence, message states, and modes
4. **Professional Restraint**: Clean, focused interface without unnecessary decoration

---

## Typography System

**Font Families:**
- Primary: Inter or Geist (via Google Fonts/CDN)
- Monospace: JetBrains Mono (for timestamps, IDs)

**Hierarchy:**
- Page Titles: text-2xl font-semibold
- Section Headers: text-lg font-medium
- Body Text: text-base font-normal
- Labels: text-sm font-medium
- Metadata/Captions: text-xs font-normal

---

## Layout System

**Spacing Units:** Tailwind units of 2, 4, 6, and 8
- Component padding: p-4 or p-6
- Section gaps: space-y-4 or space-y-6
- Page margins: p-8

**Container Strategy:**
- Sidebar: fixed w-64 (left navigation)
- Main content: flex-1 with max-w-7xl
- Modal overlays: max-w-2xl centered

---

## Component Library

### Navigation
- **Sidebar**: Fixed left navigation with icon + label items, current state with subtle background (bg-gray-100 equivalent in chosen color)
- **Top Bar**: Breadcrumbs, mode toggle (Manual/Semi-Auto), user profile dropdown

### Message Queue Components
- **Message Cards**: Compact cards showing sender, message preview, timestamp, AI confidence badge
- **List View**: Table-style layout alternative with sortable columns
- **Status Badges**: Pill-shaped indicators (Pending, Approved, Rejected, Auto-sent)
- **Confidence Meter**: Progress bar or percentage indicator (0-100%)

### Approval Interface
- **Split View**: Left = original message context, Right = AI suggested response
- **Edit Panel**: Textarea with character count, formatting options
- **Action Bar**: Primary "Approve & Send", Secondary "Edit", Tertiary "Reject" buttons

### Forms & Inputs
- **Text Fields**: Consistent height (h-10), subtle borders, clear focus states
- **Select Dropdowns**: Native with custom styling
- **Toggle Switches**: For mode switching (Manual/Auto)
- **Radio Groups**: For confidence threshold settings

### Data Displays
- **Stats Cards**: Grid layout (grid-cols-4) showing key metrics (Messages Today, Approval Rate, AI Accuracy)
- **Activity Timeline**: Chronological list with icons for different event types
- **Settings Panels**: Grouped form sections with clear labels

### Overlays
- **Modal Dialogs**: Centered with backdrop blur, max-w-2xl
- **Toast Notifications**: Top-right positioned, auto-dismiss
- **Confirmation Prompts**: Small centered modals for destructive actions

---

## Visual Patterns

**State Indicators:**
- Pending: Amber accent
- Approved: Green accent
- Rejected: Red accent
- High Confidence (>80%): Green indicator
- Medium Confidence (50-80%): Amber indicator
- Low Confidence (<50%): Red indicator

**Interaction Feedback:**
- Button hovers: Slight opacity/background shift
- Card hovers: Subtle elevation/border change
- Loading states: Skeleton screens for data loading
- Real-time updates: Gentle pulse animation on new items

---

## Page Structures

### Dashboard (Home)
- Stats overview (4-column grid)
- Recent activity timeline
- Quick actions (Configure, View Queue)

### Message Queue
- Filter/sort toolbar
- Scrollable message card list or table
- Empty state when no pending messages

### Approval Detail
- Full-screen split view layout
- Message context panel (left)
- Response editor panel (right)
- Fixed action bar (bottom)

### Settings
- Tabbed interface (Connection, Modes, Thresholds, Learning)
- Form sections with clear grouping
- Save/Cancel actions

---

## Animations
**Minimal and purposeful only:**
- Page transitions: None (instant)
- New message arrival: Subtle fade-in
- Mode switching: Smooth toggle animation (200ms)
- No scroll effects, parallax, or decorative animations

---

## Images
**No hero images needed** - this is a functional dashboard. Only use icons from Heroicons or Lucide (via CDN) for:
- Navigation items
- Message types (DM, Comment)
- Action buttons
- Empty states (simple icon illustrations)