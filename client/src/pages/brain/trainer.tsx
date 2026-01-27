import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
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
  Sparkles,
  Settings,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type Mode = "simulator" | "architect" | "copilot";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  confidence?: number;
  originalUserMessage?: string; // For assistant messages, link back to what triggered it
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
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleModeChange = (newMode: string) => {
    setMode(newMode as Mode);
    setMessages([]);
    setInputValue("");
  };

  const simulateMutation = useMutation({
    mutationFn: async (data: { message: string; history: ChatMessage[] }) => {
      const res = await apiRequest("POST", "/api/brain/simulate", {
        message: data.message,
        mode: mode,
        history: data.history,
        postCaption: showContext ? postCaption : undefined,
        postImageUrl: showContext ? postImageUrl : undefined,
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

  const handleSendMessage = () => {
    if (!inputValue.trim()) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: inputValue,
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    simulateMutation.mutate({ message: inputValue, history: newHistory });
    setInputValue("");
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
  };

  return (
    <div className="flex flex-col h-full bg-background text-foreground relative">
      {/* Header Section */}
      <div className="p-6 pb-4 space-y-6 flex-shrink-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between max-w-4xl mx-auto w-full">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Console de Comando Central</h1>
            <p className="text-muted-foreground text-sm">
              {mode === "simulator" && "Simule conversas e corrija a IA."}
              {mode === "architect" && "Construa o System Prompt perfeito."}
              {mode === "copilot" && "Gerencie o sistema e tire dúvidas."}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={clearChat}
              disabled={messages.length === 0}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Limpar
            </Button>
          </div>
        </div>

        <div className="max-w-4xl mx-auto w-full">
           <Tabs value={mode} onValueChange={handleModeChange} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="simulator">
                <Bot className="h-4 w-4 mr-2" />
                Simulador
              </TabsTrigger>
              <TabsTrigger value="architect">
                <PencilRuler className="h-4 w-4 mr-2" />
                Arquiteto
              </TabsTrigger>
              <TabsTrigger value="copilot">
                <Cpu className="h-4 w-4 mr-2" />
                Copiloto
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Context Configuration (Collapsible) */}
          {mode === "simulator" && (
            <Collapsible
              open={showContext}
              onOpenChange={setShowContext}
              className="mt-4 border rounded-lg bg-card/50"
            >
              <div className="flex items-center justify-between px-4 py-2">
                <div className="flex items-center gap-2">
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-medium text-muted-foreground">Contexto & Multimodal</h2>
                </div>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    {showContext ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                    <span className="sr-only">Toggle Context</span>
                  </Button>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent className="px-4 pb-4 space-y-4">
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
        </div>
      </div>

      {/* Chat Area */}
      <div
        className="flex-1 overflow-y-auto px-4 pb-32 w-full max-w-4xl mx-auto scroll-smooth"
        ref={scrollRef}
      >
        <div className="space-y-6 py-4">
          {messages.length === 0 ? (
            <div className="h-[40vh] flex flex-col items-center justify-center text-muted-foreground/50">
              {mode === "simulator" && <Bot className="h-16 w-16 mb-4 stroke-1" />}
              {mode === "architect" && <PencilRuler className="h-16 w-16 mb-4 stroke-1" />}
              {mode === "copilot" && <Terminal className="h-16 w-16 mb-4 stroke-1" />}
              <p className="font-light">
                {mode === "simulator"
                  ? "Inicie a simulação..."
                  : mode === "architect"
                  ? "Defina o comportamento..."
                  : "Aguardando comando..."}
              </p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-4 ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {/* Avatar for Assistant */}
                {msg.role === "assistant" && (
                  <div
                    className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 border mt-1 ${
                      mode === "architect"
                        ? "bg-purple-50 text-purple-600 border-purple-100"
                        : mode === "copilot"
                        ? "bg-blue-50 text-blue-600 border-blue-100"
                        : "bg-emerald-50 text-emerald-600 border-emerald-100"
                    }`}
                  >
                    {mode === "architect" ? (
                      <PencilRuler className="h-4 w-4" />
                    ) : mode === "copilot" ? (
                      <Cpu className="h-4 w-4" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                  </div>
                )}

                <div
                  className={`flex flex-col gap-1 max-w-[85%] ${
                    msg.role === "user" ? "items-end" : "items-start"
                  }`}
                >
                  <div
                    className={`px-4 py-3 rounded-2xl shadow-sm text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-tr-sm"
                        : "bg-muted/40 text-foreground rounded-tl-sm border"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none break-words">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            code({ node, inline, className, children, ...props }: any) {
                              const match = /language-(\w+)/.exec(className || "");
                              return !inline && match ? (
                                <SyntaxHighlighter
                                  style={vscDarkPlus}
                                  language={match[1]}
                                  PreTag="div"
                                  className="rounded-md !bg-zinc-950 !my-0"
                                  {...props}
                                >
                                  {String(children).replace(/\n$/, "")}
                                </SyntaxHighlighter>
                              ) : (
                                <code className={`${className} bg-muted px-1 py-0.5 rounded font-mono text-sm`} {...props}>
                                  {children}
                                </code>
                              );
                            },
                          }}
                        >
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>

                  {/* Message Actions */}
                  {msg.role === "assistant" && (
                    <div className="flex items-center gap-2 px-1">
                      {mode === "simulator" && (
                        <>
                          <span className="text-[10px] text-muted-foreground">
                            Confiança: {Math.round((msg.confidence || 0) * 100)}%
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 px-2 text-[10px] text-muted-foreground hover:text-primary"
                            onClick={() => openCorrectionDialog(msg)}
                          >
                            <Save className="h-3 w-3 mr-1" />
                            Corrigir
                          </Button>
                        </>
                      )}

                      {mode === "architect" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 px-2 text-[10px] text-purple-600 hover:text-purple-700"
                          onClick={() => handleApplyPrompt(msg.content)}
                          disabled={applyPromptMutation.isPending}
                        >
                          {applyPromptMutation.isPending ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                          )}
                          Aplicar Prompt
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {/* Avatar for User */}
                {msg.role === "user" && (
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 border border-primary/20 mt-1">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                )}
              </div>
            ))
          )}

          {/* Typing Indicator */}
          {simulateMutation.isPending && (
            <div className="flex gap-4 justify-start">
               <div className="h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 border mt-1 bg-muted/30">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
               </div>
               <div className="bg-muted/40 rounded-2xl rounded-tl-sm px-4 py-3 border">
                  <div className="flex gap-1 items-center h-5">
                    <div className="w-2 h-2 bg-foreground/30 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                    <div className="w-2 h-2 bg-foreground/30 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                    <div className="w-2 h-2 bg-foreground/30 rounded-full animate-bounce"></div>
                  </div>
               </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating Input Area (Sticky Footer) */}
      <div className="absolute bottom-0 left-0 right-0 p-4 z-50 bg-gradient-to-t from-background via-background to-transparent pt-10 pb-6 pointer-events-none">
        <div className="max-w-3xl mx-auto w-full pointer-events-auto">
          <div className="relative shadow-xl rounded-full bg-background border ring-1 ring-black/5 flex items-center transition-all focus-within:ring-primary/20 focus-within:shadow-2xl">
            <Input
              placeholder={
                mode === "simulator"
                  ? "Envie uma mensagem..."
                  : mode === "architect"
                  ? "Descreva as regras..."
                  : "Pergunte ao Copiloto..."
              }
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={simulateMutation.isPending}
              className="border-0 shadow-none focus-visible:ring-0 bg-transparent py-6 pl-6 pr-14 text-base rounded-full h-14"
            />
            <Button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || simulateMutation.isPending}
              size="icon"
              className="absolute right-2 h-10 w-10 rounded-full shadow-sm"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-[10px] text-center text-muted-foreground mt-2 opacity-60">
            A IA pode cometer erros. Verifique informações importantes.
          </p>
        </div>
      </div>

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
