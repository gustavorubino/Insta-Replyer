export const ptBR = {
  // Common
  common: {
    save: "Salvar",
    cancel: "Cancelar",
    delete: "Excluir",
    edit: "Editar",
    loading: "Carregando...",
    error: "Erro",
    success: "Sucesso",
    confirm: "Confirmar",
    back: "Voltar",
    next: "Próximo",
    search: "Buscar",
    filter: "Filtrar",
    all: "Todos",
    none: "Nenhum",
    yes: "Sim",
    no: "Não",
    or: "ou",
    and: "e",
  },

  // Navigation
  nav: {
    dashboard: "Dashboard",
    queue: "Fila de Aprovação",
    queueComments: "Comentários",
    queueDms: "Mensagens Diretas",
    history: "Histórico",
    settings: "Configurações",
    admin: "Administração",
    menu: "Menu",
    logout: "Sair",
  },

  // Sidebar
  sidebar: {
    title: "Instagram AI",
    subtitle: "Respostas Inteligentes",
    tokenWarning: "Conexão expirando",
    tokenWarningDesc: "Sua conexão com o Instagram precisa ser renovada.",
    reconnectNow: "Reconectar agora",
    administrator: "Administrador",
    user: "Usuário",
  },

  // Dashboard
  dashboard: {
    title: "Dashboard",
    subtitle: "Visão geral do sistema de respostas automáticas",
    totalMessages: "Total de Mensagens",
    pendingApproval: "Aguardando Aprovação",
    autoReplied: "Respostas Automáticas",
    avgConfidence: "Confiança Média",
    recentActivity: "Atividade Recente",
    noActivity: "Nenhuma atividade recente",
    viewAll: "Ver Todas",
  },

  // Queue
  queue: {
    title: "Fila de Aprovação",
    subtitle: "Revise e aprove respostas sugeridas pela IA",
    empty: "Nenhuma mensagem pendente",
    emptyDesc: "Todas as mensagens foram processadas. Novas mensagens aparecerão aqui.",
    approve: "Aprovar",
    reject: "Rejeitar",
    edit: "Editar",
    send: "Enviar",
    skip: "Pular",
    regenerate: "Regenerar Resposta",
    confidence: "Confiança",
    from: "De",
    received: "Recebida",
    suggestedResponse: "Resposta Sugerida",
    editResponse: "Editar Resposta",
    typeResponse: "Digite sua resposta...",
  },

  // History
  history: {
    title: "Histórico",
    subtitle: "Veja todas as mensagens e respostas processadas",
    empty: "Nenhuma mensagem no histórico",
    emptyDesc: "As mensagens processadas aparecerão aqui.",
    status: "Status",
    date: "Data",
    message: "Mensagem",
    response: "Resposta",
    autoSent: "Enviado Automaticamente",
    approved: "Aprovado",
    rejected: "Rejeitado",
    pending: "Pendente",
  },

  // Settings
  settings: {
    title: "Configurações",
    subtitle: "Configure seu sistema de respostas automáticas",
    saveChanges: "Salvar Alterações",
    saving: "Salvando...",
    saved: "Configurações salvas",
    savedDesc: "Suas alterações foram aplicadas com sucesso.",
    errorSaving: "Não foi possível salvar as configurações.",

    // Tabs
    tabs: {
      connection: "Conexão",
      mode: "Modo de Operação",
      ai: "Configurações da IA",
    },

    // Connection
    connection: {
      title: "Conexão com Instagram",
      description: "Conecte sua conta Instagram Business para começar a receber mensagens e comentários.",
      connected: "Conta conectada",
      notConnected: "Conta não conectada",
      notConnectedDesc: "Para usar o sistema de respostas automáticas, você precisa conectar sua conta Instagram Business.",
      connect: "Conectar Instagram",
      connecting: "Conectando...",
      disconnect: "Desconectar",
      disconnecting: "Desconectando...",
      disconnected: "Instagram desconectado",
      disconnectedDesc: "Sua conta Instagram foi desconectada.",
      refreshProfile: "Atualizar foto de perfil",
      profileUpdated: "Perfil atualizado",
      profileUpdatedDesc: "Sua foto de perfil do Instagram foi atualizada.",
      profileVerified: "Perfil verificado",
      profileVerifiedDesc: "Seu perfil do Instagram está atualizado.",
      howToVerify: "Como verificar a conexão",
      verifyStep1: "Envie uma DM para sua conta Instagram de outra conta",
      verifyStep2: "A mensagem deve aparecer na Fila de Aprovação em alguns segundos",
      verifyStep3: "Se não aparecer, peça a um administrador verificar o mapeamento de webhook",
      documentation: "Documentação",
      docDescription: "Você precisará de uma conta Instagram Business conectada a uma página do Facebook para usar a API.",
      viewDocs: "Ver documentação da API do Instagram",
    },

    // Operation Mode
    mode: {
      title: "Modo de Operação",
      description: "Escolha como o sistema deve processar as respostas.",
      manual: "Modo Manual (100% Aprovação)",
      manualDesc: "Todas as respostas precisam de aprovação humana antes de serem enviadas. Ideal para treinamento inicial da IA.",
      semiAuto: "Modo Semi-Automático",
      semiAutoDesc: "A IA envia automaticamente respostas com alta confiança. Respostas com baixa confiança são enviadas para aprovação.",
      recommended: "Recomendado",
      auto: "Modo Automático (100% Auto)",
      autoDesc: "Todas as respostas são enviadas automaticamente sem aprovação. Use apenas quando a IA estiver bem treinada.",
      trainedAI: "IA Treinada",
      confidenceThreshold: "Limiar de Confiança",
      confidenceDesc: "Mensagens com certeza de {threshold}% ou mais = envio automático. Abaixo de {threshold}% = você aprova manualmente. Slider mais baixo = mais mensagens automáticas. Slider mais alto = mais revisão humana.",
    },

    // AI Settings
    ai: {
      systemPrompt: "Prompt do Sistema",
      systemPromptDesc: "Defina instruções personalizadas para a IA seguir ao gerar respostas.",
      systemPromptPlaceholder: "Ex: Você é um assistente amigável que responde em nome da loja XYZ. Seja sempre educado e profissional. Ofereça ajuda com dúvidas sobre produtos...",
      systemPromptHelper: "Este prompt será usado como contexto para todas as respostas geradas. Seja específico sobre o tom, estilo e informações que a IA deve incluir.",
      autoLearning: "Aprendizado Automático",
      autoLearningDesc: "A IA aprende continuamente com suas correções.",
      autoLearningInfo1: "Quando você edita uma resposta sugerida pela IA e envia, o sistema armazena a correção automaticamente para melhorar futuras sugestões.",
      autoLearningInfo2: "Quanto mais correções você fizer, mais precisa a IA se torna ao responder mensagens similares.",
    },

    // Errors
    errors: {
      instagramConnected: "Instagram conectado",
      instagramConnectedDesc: "Sua conta Instagram foi conectada com sucesso!",
      connectionError: "Erro na conexão",
      noPages: "Nenhuma página do Facebook foi encontrada. Certifique-se de ter uma página vinculada.",
      noBusinessAccount: "Nenhuma conta Instagram Business foi encontrada. Vincule uma conta Instagram Business à sua página do Facebook.",
      sessionExpired: "Sua sessão expirou. Por favor, tente novamente.",
      credentialsMissing: "Credenciais do Facebook App não configuradas. Contate um administrador.",
      genericError: "Não foi possível conectar ao Instagram.",
      startConnectionError: "Não foi possível iniciar a conexão com Instagram.",
      disconnectError: "Não foi possível desconectar o Instagram.",
      refreshError: "Não foi possível atualizar o perfil do Instagram.",
    },
  },

  // Admin
  admin: {
    title: "Administração",
    subtitle: "Gerencie usuários e configurações do sistema",
    users: "Usuários",
    webhooks: "Webhooks",
    logs: "Logs",
  },

  // Landing
  landing: {
    title: "Instagram AI",
    subtitle: "Respostas Inteligentes para o seu Instagram Business",
    description: "Automatize suas respostas do Instagram com inteligência artificial. Economize tempo e mantenha seus clientes satisfeitos.",
    getStarted: "Começar Agora",
    learnMore: "Saiba Mais",
    features: {
      title: "Recursos",
      ai: "IA Avançada",
      aiDesc: "Respostas inteligentes geradas por IA de última geração",
      automation: "Automação",
      automationDesc: "Envio automático ou semi-automático de respostas",
      learning: "Aprendizado",
      learningDesc: "A IA aprende com suas correções e melhora continuamente",
    },
  },

  // Login
  login: {
    title: "Entrar",
    subtitle: "Acesse sua conta para gerenciar respostas",
    withReplit: "Entrar com Replit",
    terms: "Ao entrar, você concorda com nossos Termos de Uso e Política de Privacidade.",
  },

  // Not Found
  notFound: {
    title: "Página não encontrada",
    description: "A página que você está procurando não existe.",
    goHome: "Voltar ao início",
  },

  // Language
  language: {
    title: "Idioma",
    ptBR: "Português (Brasil)",
    en: "English",
  },

  // Toasts
  toasts: {
    error: "Erro",
    success: "Sucesso",
    warning: "Atenção",
    info: "Informação",
  },

  // Time
  time: {
    justNow: "agora mesmo",
    minutesAgo: "há {count} minuto(s)",
    hoursAgo: "há {count} hora(s)",
    daysAgo: "há {count} dia(s)",
    weeksAgo: "há {count} semana(s)",
  },
};

export type TranslationKeys = typeof ptBR;
