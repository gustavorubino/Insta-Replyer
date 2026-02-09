import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import {
  Send,
  Bot,
  User,
  Save,
  Loader2,
  RotateCcw,
  CheckCircle2,
  Terminal,
  PencilRuler,
  Cpu,

  Mic,
  Image as ImageIcon,
  X,
  Database,
  Dna,
  GitMerge,
  Replace,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { useLanguage } from "@/i18n";
import type { SettingsData } from "@/types/settings";

type Mode = "simulator" | "architect" | "copilot" | "operation";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  confidence?: number;
  originalUserMessage?: string; // For assistant messages, link back to what triggered it
  isFinalInstruction?: boolean; // For architect mode - indicates if this is a final instruction ready to be saved
  recommendation?: {
    target: "identity" | "database" | null;
    reason: string;
  } | null;
}

export default function Trainer() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  
  const [mode, setMode] = useState<Mode>("simulator");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [correction, setCorrection] = useState("");
  const [postCaption, setPostCaption] = useState("");
  const [postImageUrl, setPostImageUrl] = useState("");
  const [showContext, setShowContext] = useState(false);

  // Settings state for operation mode
  const { data: settings } = useQuery<SettingsData>({
    queryKey: ["/api/settings"],
  });
  
  const [localSettings, setLocalSettings] = useState<SettingsData | null>(null);

  // Multimodal State
  const [attachments, setAttachments] = useState<string[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<number>>(new Set());
  const recognitionRef = useRef<any>(null);

  // Identity Modal State
  const [isIdentityModalOpen, setIsIdentityModalOpen] = useState(false);
  const [pendingIdentityContent, setPendingIdentityContent] = useState<string>("");
  const [isMerging, setIsMerging] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync localSettings when settings data loads
  useEffect(() => {
    if (settings) {
      setLocalSettings(settings);
    }
  }, [settings]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [inputValue]);

  // Clean up speech recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const handleModeChange = (newMode: string) => {
    setMode(newMode as Mode);
    setMessages([]);
    setInputValue("");
    setAttachments([]);
  };

  const simulateMutation = useMutation({
    mutationFn: async (data: { message: string; history: ChatMessage[]; attachments?: string[] }) => {
      const res = await apiRequest("POST", "/api/brain/simulate", {
        message: data.message,
        mode: mode,
        history: data.history,
        postCaption: showContext ? postCaption : undefined,
        postImageUrl: showContext ? postImageUrl : undefined,
        attachments: data.attachments,
      });
      return res.json();
    },
    onSuccess: (data, variables) => {
      const botMsg: ChatMessage = {
        id: Date.now().toString(),
        role: "assistant",
        content: data.response,
        confidence: data.confidence,
        originalUserMessage: variables.message,
        isFinalInstruction: data.isFinalInstruction,
        recommendation: data.recommendation,
      };
      setMessages((prev) => [...prev, botMsg]);
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Falha ao gerar resposta da IA.",
        variant: "destructive",
      });
    },
  });

  const saveDatasetMutation = useMutation({
    mutationFn: async (data: { question: string; answer: string }) => {
      await apiRequest("POST", "/api/brain/dataset", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brain/dataset"] });
      setIsEditOpen(false);
      toast({
        title: "Aprendizado Salvo",
        description: "Novo exemplo adicionado ao dataset.",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Falha ao salvar aprendizado.",
        variant: "destructive",
      });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (newSettings: Partial<SettingsData>) => {
      await apiRequest("PATCH", "/api/settings", newSettings);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: t.settings.saved,
        description: t.settings.savedDesc,
      });
    },
    onError: () => {
      toast({
        title: t.common.error,
        description: t.settings.errorSaving,
        variant: "destructive",
      });
    },
  });

  const handleSaveSettings = () => {
    if (localSettings) {
      saveMutation.mutate(localSettings);
    }
  };

  const hasChanges =
    localSettings && settings
      ? JSON.stringify(localSettings) !== JSON.stringify(settings)
      : false;

  const applyPromptMutation = useMutation({
    mutationFn: async (systemPrompt: string) => {
      await apiRequest("PATCH", "/api/settings", { systemPrompt });
    },
    onSuccess: () => {
      toast({
        title: "Prompt Aplicado",
        description: "A configuração global do bot foi atualizada.",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Falha ao aplicar o prompt.",
        variant: "destructive",
      });
    },
  });

  // Mutation for REPLACING identity (system prompt) - direct overwrite
  const replaceIdentityMutation = useMutation({
    mutationFn: async (content: string) => {
      console.log("[Architect] Replacing system prompt with new content");
      await apiRequest("PATCH", "/api/settings", { systemPrompt: content });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      setIsIdentityModalOpen(false);
      setPendingIdentityContent("");
      toast({
        title: "🧬 Substituído na Identidade",
        description: "O prompt anterior foi substituído pelo novo.",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Falha ao substituir na identidade.",
        variant: "destructive",
      });
    },
  });

  // Mutation for MERGING identity - uses AI to combine prompts
  const mergeIdentityMutation = useMutation({
    mutationFn: async (newContent: string) => {
      console.log("[Architect] Merging prompts via AI");
      setIsMerging(true);
      // Call the merge endpoint which will use AI to combine the prompts
      const res = await apiRequest("POST", "/api/brain/merge-prompts", { newPrompt: newContent });
      return res.json();
    },
    onSuccess: (data) => {
      setIsMerging(false);
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      setIsIdentityModalOpen(false);
      setPendingIdentityContent("");
      toast({
        title: "🧬 Mesclado na Identidade",
        description: "Os prompts foram combinados inteligentemente pela IA.",
      });
    },
    onError: () => {
      setIsMerging(false);
      toast({
        title: "Erro",
        description: "Falha ao mesclar prompts.",
        variant: "destructive",
      });
    },
  });

  // Legacy mutation kept for backwards compatibility
  const saveToIdentityMutation = useMutation({
    mutationFn: async (content: string) => {
      await apiRequest("PATCH", "/api/settings", { systemPrompt: content });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: "🧬 Salvo na Identidade",
        description: "O conteúdo foi adicionado ao prompt do sistema.",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Falha ao salvar na identidade.",
        variant: "destructive",
      });
    },
  });

  // Function to extract only technical prompt from markdown code blocks
  const extractTechnicalPrompt = (content: string): string => {
    // Match all markdown code blocks (```...```)
    const codeBlockRegex = /```(?:\w+)?\n?([\s\S]*?)```/g;
    const matches = [];
    let match;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      matches.push(match[1].trim());
    }

    // If we found code blocks, return them joined
    if (matches.length > 0) {
      console.log("[Architect] Extracted", matches.length, "code blocks from content");
      return matches.join("\n\n").trim();
    }

    // Fallback: try to remove conversational prefixes and return the content
    const cleanedContent = content
      .replace(/^(Ótimo!|Perfeito!|Excelente!|Claro!|Certo!|Ok!|Entendido!|Com base no que discutimos[^.]*\.|Aqui está[^:]*:|Segue[^:]*:|Vou criar[^.]*\.)[\s\n]*/gi, "")
      .replace(/^(Se isso está de acordo|Se precisar de mais|Caso tenha|Qualquer dúvida)[^.]*\.[\s\n]*/gi, "")
      .trim();

    console.log("[Architect] No code blocks found, using cleaned content");
    return cleanedContent;
  };

  // Handler to open identity modal instead of saving directly
  const handleSaveToIdentity = (content: string) => {
    // Extract only technical prompt, removing conversational text
    const technicalPrompt = extractTechnicalPrompt(content);
    console.log("[Architect] Opening identity modal for technical prompt:", technicalPrompt.substring(0, 100) + "...");
    setPendingIdentityContent(technicalPrompt);
    setIsIdentityModalOpen(true);
  };

  // Handler for replace action
  const handleReplaceIdentity = () => {
    if (pendingIdentityContent) {
      replaceIdentityMutation.mutate(pendingIdentityContent);
    }
  };

  // Handler for merge action
  const handleMergeIdentity = () => {
    if (pendingIdentityContent) {
      mergeIdentityMutation.mutate(pendingIdentityContent);
    }
  };

  // Mutation for saving architect response to database (dataset) - INSERT (cumulative)
  const saveToDatabasFromArchitectMutation = useMutation({
    mutationFn: async (data: { question: string; answer: string }) => {
      console.log("[Architect] Adding to database (INSERT - cumulative):", data.question.substring(0, 50));
      await apiRequest("POST", "/api/brain/dataset", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brain/dataset"] });
      toast({
        title: "📚 Adicionado à Database",
        description: "A instrução foi adicionada à memória RAG (cumulativo).",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Falha ao salvar na database.",
        variant: "destructive",
      });
    },
  });

  const handleSendMessage = () => {
    if (!inputValue.trim() && attachments.length === 0) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: inputValue + (attachments.length > 0 ? `\n[${attachments.length} imagem(ns) anexada(s)]` : ""),
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);

    if (attachments.length > 0) {
      console.log(`Sending ${attachments.length} attachments. Sample:`, attachments[0].substring(0, 50) + "...");
    }

    simulateMutation.mutate({
      message: inputValue,
      history: newHistory,
      attachments: attachments.length > 0 ? attachments : undefined
    });
    setInputValue("");
    setAttachments([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const openCorrectionDialog = (msg: ChatMessage) => {
    if (!msg.originalUserMessage) return;
    setEditingMessage(msg);
    setCorrection(msg.content);
    setIsEditOpen(true);
  };

  const handleSaveCorrection = () => {
    if (!editingMessage?.originalUserMessage || !correction.trim()) return;

    saveDatasetMutation.mutate({
      question: editingMessage.originalUserMessage,
      answer: correction,
    });
  };

  const handleApplyPrompt = (content: string) => {
    applyPromptMutation.mutate(content);
  };

  const clearChat = () => {
    setMessages([]);
    setAttachments([]);
  };

  // --- Multimodal Handlers ---

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({
        title: "Recurso Indisponível",
        description: "Seu navegador não suporta reconhecimento de voz (Web Speech API). Tente usar o Google Chrome ou Edge.",
        variant: "destructive",
      });
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = "pt-BR";
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onresult = (event: any) => {
        let interimTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            const transcript = event.results[i][0].transcript;
            setInputValue((prev) => prev + (prev && !prev.endsWith(" ") ? " " : "") + transcript);
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        setIsListening(false);
        if (event.error !== 'no-speech') { // Ignore no-speech errors which happen often
          toast({
            title: "Erro no Microfone",
            description: "Não foi possível acessar o microfone ou ocorreu um erro.",
            variant: "destructive",
          });
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
      setIsListening(true);
    } catch (e) {
      console.error(e);
      toast({
        title: "Erro",
        description: "Falha ao iniciar o reconhecimento de voz.",
        variant: "destructive",
      });
    }
  };

  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newAttachments: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith("image/")) continue;

      try {
        const base64 = await convertFileToBase64(file);
        newAttachments.push(base64);
      } catch (err) {
        console.error("Error reading file:", err);
      }
    }

    setAttachments((prev) => [...prev, ...newAttachments]);
    e.target.value = ""; // Reset input
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    let hasImage = false;
    const imageFiles: File[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        hasImage = true;
        const file = item.getAsFile();
        if (file) {
          imageFiles.push(file);
        }
      }
    }

    if (hasImage) {
      e.preventDefault();

      const processImages = async () => {
        const newAttachments: string[] = [];
        for (const file of imageFiles) {
          try {
            const base64 = await convertFileToBase64(file);
            newAttachments.push(base64);
          } catch (err) {
            console.error("Error reading pasted file:", err);
          }
        }
        setAttachments((prev) => [...prev, ...newAttachments]);
      };

      processImages();
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="p-6 h-[calc(100vh-4rem)] flex flex-col gap-6">
      <div className="flex flex-col gap-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Console de Comando Central</h1>
            <p className="text-muted-foreground">
              {mode === "simulator" && "Simule conversas para testar a IA. Apenas simulação e treinamento - sem ações de prompt ou regras."}
              {mode === "architect" && "Único lugar para construir e enviar o System Prompt que define a personalidade da IA."}
              {mode === "copilot" && "Tire dúvidas sobre o sistema, estatísticas e configurações."}
              {mode === "operation" && "Configure o modo de operação da IA."}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={clearChat}
              disabled={messages.length === 0 && attachments.length === 0}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Limpar
            </Button>
          </div>
        </div>

        <div className="bg-muted/50 p-1 rounded-full flex w-full max-w-2xl mx-auto">
          {(["simulator", "architect", "copilot", "operation"] as const).map((m) => (
            <button
              key={m}
              onClick={() => handleModeChange(m)}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-full text-sm font-medium transition-all ${mode === m
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground/80"
                }`}
            >
              {m === "simulator" && <Bot className="h-4 w-4" />}
              {m === "architect" && <PencilRuler className="h-4 w-4" />}
              {m === "copilot" && <Cpu className="h-4 w-4" />}
              {m === "operation" && <Terminal className="h-4 w-4" />}
              <span className="capitalize">
                {m === "simulator"
                  ? "Simulador"
                  : m === "architect"
                    ? "Arquiteto"
                    : m === "copilot"
                      ? "Copiloto"
                      : "Modo de Operação"}
              </span>
            </button>
          ))}
        </div>

        {/* Operation Mode Card */}
        {mode === "operation" && localSettings && (
          <Card className="max-w-2xl mx-auto w-full">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5" />
                  {t.settings.mode.title}
                </CardTitle>
                <Button
                  onClick={handleSaveSettings}
                  disabled={!hasChanges || saveMutation.isPending}
                  size="sm"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {saveMutation.isPending ? t.settings.saving : t.settings.saveChanges}
                </Button>
              </div>
              <CardDescription>
                {t.settings.mode.description}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                className={`p-4 rounded-lg border cursor-pointer transition-colors ${localSettings.operationMode === "manual"
                  ? "border-primary bg-primary/5"
                  : "hover:bg-muted/50"
                  }`}
                onClick={() =>
                  setLocalSettings({ ...localSettings, operationMode: "manual" })
                }
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`h-4 w-4 rounded-full border-2 mt-0.5 ${localSettings.operationMode === "manual"
                      ? "border-primary bg-primary"
                      : "border-muted-foreground"
                      }`}
                  >
                    {localSettings.operationMode === "manual" && (
                      <div className="h-full w-full flex items-center justify-center">
                        <div className="h-1.5 w-1.5 rounded-full bg-white"></div>
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium">{t.settings.mode.manual}</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t.settings.mode.manualDesc}
                    </p>
                  </div>
                </div>
              </div>

              <div
                className={`p-4 rounded-lg border cursor-pointer transition-colors ${localSettings.operationMode === "semi_auto"
                  ? "border-primary bg-primary/5"
                  : "hover:bg-muted/50"
                  }`}
                onClick={() =>
                  setLocalSettings({
                    ...localSettings,
                    operationMode: "semi_auto",
                  })
                }
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`h-4 w-4 rounded-full border-2 mt-0.5 ${localSettings.operationMode === "semi_auto"
                      ? "border-primary bg-primary"
                      : "border-muted-foreground"
                      }`}
                  >
                    {localSettings.operationMode === "semi_auto" && (
                      <div className="h-full w-full flex items-center justify-center">
                        <div className="h-1.5 w-1.5 rounded-full bg-white"></div>
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-medium">{t.settings.mode.semiAuto}</h4>
                      <Badge variant="secondary" className="text-xs">
                        {t.settings.mode.recommended}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t.settings.mode.semiAutoDesc}
                    </p>
                    {localSettings.operationMode === "semi_auto" && (
                      <div className="mt-4 pt-4 border-t" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-2">
                          <Label>{t.settings.mode.confidenceThreshold}</Label>
                          <span className="text-sm font-medium">
                            {localSettings.confidenceThreshold}%
                          </span>
                        </div>
                        <Slider
                          value={[localSettings.confidenceThreshold]}
                          onValueChange={([value]) =>
                            setLocalSettings({
                              ...localSettings,
                              confidenceThreshold: value,
                            })
                          }
                          min={50}
                          max={95}
                          step={5}
                          className="w-full"
                        />
                        <p className="text-xs text-muted-foreground mt-2">
                          {t.settings.mode.confidenceDesc.replace(/\{threshold\}/g, String(localSettings.confidenceThreshold))}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div
                className={`p-4 rounded-lg border cursor-pointer transition-colors ${localSettings.operationMode === "auto"
                  ? "border-primary bg-primary/5"
                  : "hover:bg-muted/50"
                  }`}
                onClick={() =>
                  setLocalSettings({
                    ...localSettings,
                    operationMode: "auto",
                  })
                }
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`h-4 w-4 rounded-full border-2 mt-0.5 ${localSettings.operationMode === "auto"
                      ? "border-primary bg-primary"
                      : "border-muted-foreground"
                      }`}
                  >
                    {localSettings.operationMode === "auto" && (
                      <div className="h-full w-full flex items-center justify-center">
                        <div className="h-1.5 w-1.5 rounded-full bg-white"></div>
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-medium">{t.settings.mode.auto}</h4>
                      <Badge variant="outline" className="text-xs border-amber-500 text-amber-600">
                        {t.settings.mode.trainedAI}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t.settings.mode.autoDesc}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>


      {mode !== "operation" && (
      <Card className="flex-1 flex flex-col overflow-hidden relative border shadow-sm rounded-xl bg-background">
        <div
          className="flex-1 overflow-y-auto p-4 space-y-6 pb-32"
          ref={scrollRef}
        >
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-50">
              {mode === "simulator" && <Bot className="h-16 w-16 mb-4" />}
              {mode === "architect" && <PencilRuler className="h-16 w-16 mb-4" />}
              {mode === "copilot" && <Terminal className="h-16 w-16 mb-4" />}
              <p>
                {mode === "simulator"
                  ? "Envie uma mensagem para começar o treinamento."
                  : mode === "architect"
                    ? "Comece descrevendo como você quer que o bot se comporte."
                    : "Pergunte sobre estatísticas ou configurações do sistema."}
              </p>
            </div>
          ) : (
            messages.map((msg, index) => (
              <div
                key={msg.id}
                className={`flex gap-4 ${msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
              >
                {msg.role === "assistant" && (
                  <div
                    className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${mode === "architect"
                      ? "bg-purple-100 text-purple-600"
                      : mode === "copilot"
                        ? "bg-blue-100 text-blue-600"
                        : "bg-primary/10 text-primary"
                      }`}
                  >
                    {mode === "architect" ? (
                      <PencilRuler className="h-6 w-6" />
                    ) : mode === "copilot" ? (
                      <Cpu className="h-6 w-6" />
                    ) : (
                      <Bot className="h-6 w-6" />
                    )}
                  </div>
                )}

                <div
                  className={`flex flex-col gap-1 max-w-[85%] ${msg.role === "user" ? "items-end" : "items-start"
                    }`}
                >
                  <div
                    className={`px-5 py-3 shadow-sm ${msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-2xl rounded-tr-md"
                      : "bg-transparent text-foreground p-0 shadow-none"
                      }`}
                  >
                    {msg.role === "user" ? (
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
                    ) : (
                      <MarkdownRenderer content={msg.content} />
                    )}
                  </div>

                  {msg.role === "assistant" && mode === "simulator" && (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">
                        Confiança: {Math.round((msg.confidence || 0) * 100)}%
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-primary hover:text-primary/80"
                        onClick={() => openCorrectionDialog(msg)}
                      >
                        <Save className="h-3 w-3 mr-1" />
                        Corrigir & Ensinar
                      </Button>
                    </div>
                  )}

                  {msg.role === "assistant" && mode === "architect" && msg.isFinalInstruction && !dismissedSuggestions.has(index) && (() => {
                    const handleDismiss = () => {
                      setDismissedSuggestions(prev => new Set([...Array.from(prev), index]));
                    };

                    // Get recommendation from AI or null
                    const recommendation = msg.recommendation;
                    const suggestionTarget = recommendation?.target;
                    const suggestionReason = recommendation?.reason;

                    return (
                      <div className="flex flex-col gap-3 mt-3 p-4 bg-gradient-to-r from-purple-50/80 to-blue-50/80 dark:from-purple-950/30 dark:to-blue-950/30 rounded-lg border border-purple-200/50 dark:border-purple-800/50">
                        {/* Recommendation text - always show when isFinalInstruction */}
                        <div className="flex items-start gap-2 text-sm">
                          <span className="text-lg">🤖</span>
                          <div className="flex-1">
                            <span className="font-medium text-purple-700 dark:text-purple-300">Sugestão do Arquiteto: </span>
                            <span className="font-semibold">
                              {suggestionTarget === "identity" && "🧬 Identidade"}
                              {suggestionTarget === "database" && "📚 Database"}
                              {!suggestionTarget && "Escolha onde salvar"}
                            </span>
                            {suggestionReason && (
                              <span className="text-muted-foreground ml-1">— {suggestionReason}</span>
                            )}
                          </div>
                        </div>

                        {/* Buttons Row */}
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-muted-foreground">Onde salvar:</span>
                          <Button
                            variant={suggestionTarget === "identity" ? "default" : "outline"}
                            size="sm"
                            className={`h-7 px-3 text-xs ${suggestionTarget === "identity"
                              ? "bg-purple-600 hover:bg-purple-700 text-white"
                              : "border-purple-300 hover:bg-purple-50 hover:border-purple-400"}`}
                            onClick={() => handleSaveToIdentity(msg.content)}
                            disabled={replaceIdentityMutation.isPending || mergeIdentityMutation.isPending || saveToDatabasFromArchitectMutation.isPending}
                          >
                            {(replaceIdentityMutation.isPending || mergeIdentityMutation.isPending) ? (
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : (
                              <Dna className="h-3 w-3 mr-1" />
                            )}
                            🧬 Identidade
                          </Button>
                          <Button
                            variant={suggestionTarget === "database" ? "default" : "outline"}
                            size="sm"
                            className={`h-7 px-3 text-xs ${suggestionTarget === "database"
                              ? "bg-blue-600 hover:bg-blue-700 text-white"
                              : "border-blue-300 hover:bg-blue-50 hover:border-blue-400"}`}
                            onClick={() => {
                              const cleanedContent = extractTechnicalPrompt(msg.content);
                              saveToDatabasFromArchitectMutation.mutate({
                                question: msg.originalUserMessage || "Instrução do Arquiteto",
                                answer: cleanedContent,
                              });
                            }}
                            disabled={replaceIdentityMutation.isPending || mergeIdentityMutation.isPending || saveToDatabasFromArchitectMutation.isPending}
                          >
                            {saveToDatabasFromArchitectMutation.isPending ? (
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : (
                              <Database className="h-3 w-3 mr-1" />
                            )}
                            📚 Database
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-3 text-xs border-gray-300 hover:bg-gray-50 hover:border-gray-400 text-gray-600"
                            onClick={handleDismiss}
                          >
                            <X className="h-3 w-3 mr-1" />
                            ❌ Não Aplicar
                          </Button>
                        </div>

                        {/* Legend - Guide of Decision */}
                        <div className="mt-2 pt-2 border-t border-purple-100 dark:border-purple-800/50">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-muted-foreground">
                            <div className="flex items-start gap-1.5">
                              <span className="text-purple-500">🧬</span>
                              <span><strong className="text-foreground">Identidade:</strong> Define o "Cérebro" e tom de voz (Quem a IA é)</span>
                            </div>
                            <div className="flex items-start gap-1.5">
                              <span className="text-blue-500">📚</span>
                              <span><strong className="text-foreground">Database:</strong> Adiciona fatos e memórias (O que a IA sabe)</span>
                            </div>
                            <div className="flex items-start gap-1.5">
                              <span className="text-gray-500">❌</span>
                              <span><strong className="text-foreground">Não Aplicar:</strong> Descarta a instrução atual</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            ))
          )}
          {simulateMutation.isPending && (
            <div className="flex justify-start gap-4">
              <div className="h-10 w-10 rounded-lg bg-muted/50 flex items-center justify-center">
                <Bot className="h-6 w-6 text-muted-foreground animate-pulse" />
              </div>
              <div className="flex items-center gap-1 h-10 px-2">
                <span className="h-2 w-2 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                <span className="h-2 w-2 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                <span className="h-2 w-2 bg-muted-foreground/40 rounded-full animate-bounce"></span>
              </div>
            </div>
          )}
        </div>

        {/* Attachment Previews */}
        {attachments.length > 0 && (
          <div className="absolute bottom-20 left-0 right-0 px-4 flex justify-center z-10 pointer-events-none">
            <div className="flex gap-2 p-2 bg-background/95 backdrop-blur-sm rounded-xl border shadow-sm pointer-events-auto">
              {attachments.map((src, i) => (
                <div key={i} className="relative h-16 w-16 rounded-lg overflow-hidden border group bg-muted">
                  <img src={src} alt="preview" className="h-full w-full object-cover" />
                  <button
                    onClick={() => removeAttachment(i)}
                    className="absolute top-0.5 right-0.5 bg-black/50 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="absolute bottom-6 left-0 right-0 px-4 flex justify-center z-10 pointer-events-none">
          <div className="w-full max-w-3xl bg-background shadow-xl rounded-[26px] border p-1.5 flex items-end gap-2 pointer-events-auto transition-all duration-300 ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
            {/* File Upload Button */}
            <input
              type="file"
              accept="image/png, image/jpeg"
              multiple
              className="hidden"
              id="file-upload"
              onChange={handleFileSelect}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-full text-muted-foreground hover:text-foreground shrink-0 hover:bg-muted mb-0.5"
              onClick={() => document.getElementById('file-upload')?.click()}
              disabled={simulateMutation.isPending}
            >
              <ImageIcon className="h-5 w-5" />
            </Button>

            {/* Microphone Button */}
            <Button
              variant="ghost"
              size="icon"
              className={`h-10 w-10 rounded-full shrink-0 transition-colors mb-0.5 ${isListening ? "text-red-600 bg-red-100 hover:bg-red-200 animate-pulse" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
              onClick={toggleListening}
              disabled={simulateMutation.isPending}
            >
              <Mic className="h-5 w-5" />
            </Button>

            <Textarea
              ref={textareaRef}
              className="flex-1 min-h-[44px] max-h-[150px] border-0 focus-visible:ring-0 shadow-none bg-transparent resize-none py-3 px-2 text-sm"
              placeholder={
                mode === "simulator"
                  ? "Digite uma mensagem..."
                  : mode === "architect"
                    ? "Descreva o comportamento..."
                    : "Pergunte algo..."
              }
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              disabled={simulateMutation.isPending}
              spellCheck={true}
              rows={1}
            />
            <Button
              onClick={handleSendMessage}
              disabled={(!inputValue.trim() && attachments.length === 0) || simulateMutation.isPending}
              size="icon"
              className="h-10 w-10 rounded-full shrink-0 mb-0.5"
            >
              <Send className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </Card>
      )}

      {/* Dialog for Simulator Mode - Edit & Learn */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Ensinar IA (Few-Shot Learning)</DialogTitle>
            <DialogDescription>
              Corrija a resposta abaixo. O sistema salvará o par (Pergunta + Sua
              Correção) na Memória para aprender este padrão.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Pergunta do Usuário (Contexto)</Label>
              <div className="p-3 rounded-md bg-muted text-sm text-muted-foreground italic">
                "{editingMessage?.originalUserMessage}"
              </div>
            </div>

            <div className="space-y-2">
              <Label>Resposta Ideal (Corrija aqui)</Label>
              <Textarea
                value={correction}
                onChange={(e) => setCorrection(e.target.value)}
                className="min-h-[150px]"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSaveCorrection}
              disabled={saveDatasetMutation.isPending}
            >
              {saveDatasetMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Salvar & Aprender
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Identity Confirmation Modal - Replace vs Merge */}
      <Dialog open={isIdentityModalOpen} onOpenChange={setIsIdentityModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Dna className="h-5 w-5 text-purple-600" />
              Salvar na Identidade
            </DialogTitle>
            <DialogDescription>
              Escolha como aplicar o novo prompt ao System Prompt existente:
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="p-3 rounded-lg bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/30 dark:to-blue-950/30 border border-purple-200/50 dark:border-purple-800/50">
              <p className="text-xs text-muted-foreground mb-2">Novo conteúdo a ser aplicado:</p>
              <p className="text-sm line-clamp-4">
                {pendingIdentityContent.substring(0, 300)}
                {pendingIdentityContent.length > 300 && "..."}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="h-auto p-4 flex flex-col items-start gap-2 border-orange-200 hover:border-orange-400 hover:bg-orange-50"
                onClick={handleReplaceIdentity}
                disabled={replaceIdentityMutation.isPending || mergeIdentityMutation.isPending}
              >
                <div className="flex items-center gap-2">
                  {replaceIdentityMutation.isPending ? (
                    <Loader2 className="h-5 w-5 animate-spin text-orange-600" />
                  ) : (
                    <Replace className="h-5 w-5 text-orange-600" />
                  )}
                  <span className="font-semibold text-orange-700">Substituir</span>
                </div>
                <span className="text-xs text-muted-foreground text-left">
                  Apaga o prompt anterior e usa o novo
                </span>
              </Button>

              <Button
                variant="outline"
                className="h-auto p-4 flex flex-col items-start gap-2 border-green-200 hover:border-green-400 hover:bg-green-50"
                onClick={handleMergeIdentity}
                disabled={replaceIdentityMutation.isPending || mergeIdentityMutation.isPending || isMerging}
              >
                <div className="flex items-center gap-2">
                  {(mergeIdentityMutation.isPending || isMerging) ? (
                    <Loader2 className="h-5 w-5 animate-spin text-green-600" />
                  ) : (
                    <GitMerge className="h-5 w-5 text-green-600" />
                  )}
                  <span className="font-semibold text-green-700">Mesclar</span>
                </div>
                <span className="text-xs text-muted-foreground text-left">
                  IA combina o prompt atual + novo inteligentemente
                </span>
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setIsIdentityModalOpen(false)}
              disabled={replaceIdentityMutation.isPending || mergeIdentityMutation.isPending}
            >
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
