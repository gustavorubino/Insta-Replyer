import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
  Settings2,
  Mic,
  Image as ImageIcon,
  X,
  Database,
  Dna,
} from "lucide-react";
import {
  Card,
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { MarkdownRenderer } from "@/components/markdown-renderer";

type Mode = "simulator" | "architect" | "copilot";

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
  const [mode, setMode] = useState<Mode>("simulator");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [correction, setCorrection] = useState("");
  const [postCaption, setPostCaption] = useState("");
  const [postImageUrl, setPostImageUrl] = useState("");
  const [showContext, setShowContext] = useState(false);

  // Multimodal State
  const [attachments, setAttachments] = useState<string[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<number>>(new Set());
  const recognitionRef = useRef<any>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  // Mutation for saving architect response to identity (system prompt)
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

  // Mutation for saving architect response to database (dataset)
  const saveToDatabasFromArchitectMutation = useMutation({
    mutationFn: async (data: { question: string; answer: string }) => {
      await apiRequest("POST", "/api/brain/dataset", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brain/dataset"] });
      toast({
        title: "📚 Salvo na Database",
        description: "A instrução foi adicionada à memória RAG.",
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
              {mode === "simulator" && "Simule conversas e corrija a IA."}
              {mode === "architect" && "Construa o System Prompt perfeito."}
              {mode === "copilot" && "Gerencie o sistema e tire dúvidas."}
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

        <div className="bg-muted/50 p-1 rounded-full flex w-full max-w-md mx-auto">
          {(["simulator", "architect", "copilot"] as const).map((m) => (
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
              <span className="capitalize">
                {m === "simulator"
                  ? "Simulador"
                  : m === "architect"
                    ? "Arquiteto"
                    : "Copiloto"}
              </span>
            </button>
          ))}
        </div>
      </div>

      {mode === "simulator" && (
        <Collapsible
          open={showContext}
          onOpenChange={setShowContext}
          className="w-full border rounded-xl bg-card px-4 py-2 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 text-muted-foreground hover:text-foreground p-0 h-auto font-normal hover:bg-transparent"
              >
                <Settings2 className="h-4 w-4" />
                Configurar Contexto de Teste
              </Button>
            </CollapsibleTrigger>
          </div>

          <CollapsibleContent className="space-y-4 pt-4 pb-2 animate-in slide-in-from-top-2">
            <div className="grid gap-2">
              <Label htmlFor="postCaption">Legenda do Post</Label>
              <Input
                id="postCaption"
                placeholder="Ex: Foto incrível do nosso novo produto..."
                value={postCaption}
                onChange={(e) => setPostCaption(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="postImageUrl">URL da Imagem/Mídia</Label>
              <Input
                id="postImageUrl"
                placeholder="https://..."
                value={postImageUrl}
                onChange={(e) => setPostImageUrl(e.target.value)}
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

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
                      setDismissedSuggestions(prev => new Set([...prev, index]));
                    };

                    // Get recommendation from AI or null
                    const recommendation = msg.recommendation;
                    const suggestionTarget = recommendation?.target;
                    const suggestionReason = recommendation?.reason;

                    return (
                      <div className="flex flex-col gap-2 mt-3 p-3 bg-gradient-to-r from-purple-50/80 to-blue-50/80 dark:from-purple-950/30 dark:to-blue-950/30 rounded-lg border border-purple-200/50 dark:border-purple-800/50">
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

                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-muted-foreground">Onde salvar:</span>
                          <Button
                            variant={suggestionTarget === "identity" ? "default" : "outline"}
                            size="sm"
                            className={`h-7 px-3 text-xs ${suggestionTarget === "identity"
                              ? "bg-purple-600 hover:bg-purple-700 text-white"
                              : "border-purple-300 hover:bg-purple-50 hover:border-purple-400"}`}
                            onClick={() => saveToIdentityMutation.mutate(msg.content)}
                            disabled={saveToIdentityMutation.isPending || saveToDatabasFromArchitectMutation.isPending}
                          >
                            {saveToIdentityMutation.isPending ? (
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
                            onClick={() => saveToDatabasFromArchitectMutation.mutate({
                              question: msg.originalUserMessage || "Instrução do Arquiteto",
                              answer: msg.content,
                            })}
                            disabled={saveToIdentityMutation.isPending || saveToDatabasFromArchitectMutation.isPending}
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
    </div>
  );
}
