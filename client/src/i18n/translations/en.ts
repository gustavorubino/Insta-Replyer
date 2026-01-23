import type { TranslationKeys } from "./pt-BR";

export const en: TranslationKeys = {
  // Common
  common: {
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    edit: "Edit",
    loading: "Loading...",
    error: "Error",
    success: "Success",
    confirm: "Confirm",
    back: "Back",
    next: "Next",
    search: "Search",
    filter: "Filter",
    all: "All",
    none: "None",
    yes: "Yes",
    no: "No",
    or: "or",
    and: "and",
  },

  // Navigation
  nav: {
    dashboard: "Dashboard",
    queue: "Approval Queue",
    queueComments: "Comments",
    queueDms: "Direct Messages",
    history: "History",
    settings: "Settings",
    admin: "Administration",
    menu: "Menu",
    logout: "Logout",
  },

  // Sidebar
  sidebar: {
    title: "Instagram AI",
    subtitle: "Smart Responses",
    tokenWarning: "Connection expiring",
    tokenWarningDesc: "Your Instagram connection needs to be renewed.",
    reconnectNow: "Reconnect now",
    administrator: "Administrator",
    user: "User",
  },

  // Dashboard
  dashboard: {
    title: "Dashboard",
    subtitle: "Overview of the automatic response system",
    totalMessages: "Total Messages",
    pendingApproval: "Pending Approval",
    autoReplied: "Auto Replies",
    avgConfidence: "Average Confidence",
    recentActivity: "Recent Activity",
    noActivity: "No recent activity",
    viewAll: "View All",
  },

  // Queue
  queue: {
    title: "Approval Queue",
    subtitle: "Review and approve AI-suggested responses",
    empty: "No pending messages",
    emptyDesc: "All messages have been processed. New messages will appear here.",
    approve: "Approve",
    reject: "Reject",
    edit: "Edit",
    send: "Send",
    skip: "Skip",
    regenerate: "Regenerate Response",
    confidence: "Confidence",
    from: "From",
    received: "Received",
    suggestedResponse: "Suggested Response",
    editResponse: "Edit Response",
    typeResponse: "Type your response...",
  },

  // History
  history: {
    title: "History",
    subtitle: "View all processed messages and responses",
    empty: "No messages in history",
    emptyDesc: "Processed messages will appear here.",
    status: "Status",
    date: "Date",
    message: "Message",
    response: "Response",
    autoSent: "Auto Sent",
    approved: "Approved",
    rejected: "Rejected",
    pending: "Pending",
  },

  // Settings
  settings: {
    title: "Settings",
    subtitle: "Configure your automatic response system",
    saveChanges: "Save Changes",
    saving: "Saving...",
    saved: "Settings saved",
    savedDesc: "Your changes have been applied successfully.",
    errorSaving: "Could not save settings.",

    // Tabs
    tabs: {
      connection: "Connection",
      mode: "Operation Mode",
      ai: "AI Settings",
    },

    // Connection
    connection: {
      title: "Instagram Connection",
      description: "Connect your Instagram Business account to start receiving messages and comments.",
      connected: "Account connected",
      notConnected: "Account not connected",
      notConnectedDesc: "To use the automatic response system, you need to connect your Instagram Business account.",
      connect: "Connect Instagram",
      connecting: "Connecting...",
      disconnect: "Disconnect",
      disconnecting: "Disconnecting...",
      disconnected: "Instagram disconnected",
      disconnectedDesc: "Your Instagram account has been disconnected.",
      refreshProfile: "Refresh profile picture",
      profileUpdated: "Profile updated",
      profileUpdatedDesc: "Your Instagram profile picture has been updated.",
      profileVerified: "Profile verified",
      profileVerifiedDesc: "Your Instagram profile is up to date.",
      howToVerify: "How to verify the connection",
      verifyStep1: "Send a DM to your Instagram account from another account",
      verifyStep2: "The message should appear in the Approval Queue within seconds",
      verifyStep3: "If it doesn't appear, ask an administrator to check the webhook mapping",
      documentation: "Documentation",
      docDescription: "You will need an Instagram Business account connected to a Facebook Page to use the API.",
      viewDocs: "View Instagram API documentation",
    },

    // Operation Mode
    mode: {
      title: "Operation Mode",
      description: "Choose how the system should process responses.",
      manual: "Manual Mode (100% Approval)",
      manualDesc: "All responses need human approval before being sent. Ideal for initial AI training.",
      semiAuto: "Semi-Automatic Mode",
      semiAutoDesc: "The AI automatically sends high-confidence responses. Low-confidence responses are sent for approval.",
      recommended: "Recommended",
      auto: "Automatic Mode (100% Auto)",
      autoDesc: "All responses are sent automatically without approval. Use only when the AI is well trained.",
      trainedAI: "Trained AI",
      confidenceThreshold: "Confidence Threshold",
      confidenceDesc: "Messages with {threshold}% confidence or higher = auto-send. Below {threshold}% = manual approval. Lower slider = more automatic messages. Higher slider = more human review.",
    },

    // AI Settings
    ai: {
      systemPrompt: "System Prompt",
      systemPromptDesc: "Define custom instructions for the AI to follow when generating responses.",
      systemPromptPlaceholder: "Ex: You are a friendly assistant responding on behalf of XYZ store. Always be polite and professional. Help with product questions...",
      systemPromptHelper: "This prompt will be used as context for all generated responses. Be specific about the tone, style, and information the AI should include.",
      autoLearning: "Automatic Learning",
      autoLearningDesc: "The AI continuously learns from your corrections.",
      autoLearningInfo1: "When you edit an AI-suggested response and send it, the system automatically stores the correction to improve future suggestions.",
      autoLearningInfo2: "The more corrections you make, the more accurate the AI becomes at responding to similar messages.",
    },

    // Errors
    errors: {
      instagramConnected: "Instagram connected",
      instagramConnectedDesc: "Your Instagram account was connected successfully!",
      connectionError: "Connection error",
      noPages: "No Facebook pages found. Make sure you have a linked page.",
      noBusinessAccount: "No Instagram Business account found. Link an Instagram Business account to your Facebook Page.",
      sessionExpired: "Your session has expired. Please try again.",
      credentialsMissing: "Facebook App credentials not configured. Contact an administrator.",
      genericError: "Could not connect to Instagram.",
      startConnectionError: "Could not start Instagram connection.",
      disconnectError: "Could not disconnect Instagram.",
      refreshError: "Could not refresh Instagram profile.",
    },
  },

  // Admin
  admin: {
    title: "Administration",
    subtitle: "Manage users and system settings",
    users: "Users",
    webhooks: "Webhooks",
    logs: "Logs",
  },

  // Landing
  landing: {
    title: "Instagram AI",
    subtitle: "Smart Responses for your Instagram Business",
    description: "Automate your Instagram responses with artificial intelligence. Save time and keep your customers satisfied.",
    getStarted: "Get Started",
    learnMore: "Learn More",
    features: {
      title: "Features",
      ai: "Advanced AI",
      aiDesc: "Intelligent responses generated by state-of-the-art AI",
      automation: "Automation",
      automationDesc: "Automatic or semi-automatic response sending",
      learning: "Learning",
      learningDesc: "The AI learns from your corrections and continuously improves",
    },
  },

  // Login
  login: {
    title: "Sign In",
    subtitle: "Access your account to manage responses",
    withReplit: "Sign in with Replit",
    terms: "By signing in, you agree to our Terms of Service and Privacy Policy.",
  },

  // Not Found
  notFound: {
    title: "Page not found",
    description: "The page you are looking for does not exist.",
    goHome: "Go back home",
  },

  // Language
  language: {
    title: "Language",
    ptBR: "Português (Brasil)",
    en: "English",
  },

  // Toasts
  toasts: {
    error: "Error",
    success: "Success",
    warning: "Warning",
    info: "Information",
  },

  // Time
  time: {
    justNow: "just now",
    minutesAgo: "{count} minute(s) ago",
    hoursAgo: "{count} hour(s) ago",
    daysAgo: "{count} day(s) ago",
    weeksAgo: "{count} week(s) ago",
  },
};
