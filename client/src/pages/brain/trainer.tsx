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
              disabled={messages.length === 0}
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
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-full text-sm font-medium transition-all ${
                mode === m
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
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-4 ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {msg.role === "assistant" && (
                  <div
                    className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      mode === "architect"
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
                  className={`flex flex-col gap-1 max-w-[85%] ${
                    msg.role === "user" ? "items-end" : "items-start"
                  }`}
                >
                  <div
                    className={`px-5 py-3 shadow-sm ${
                      msg.role === "user"
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

                  {msg.role === "assistant" && mode === "architect" && (
                    <div className="flex items-center gap-2 mt-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-purple-600 hover:text-purple-700"
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
                    </div>
                  )}
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
        <div className="absolute bottom-6 left-0 right-0 px-4 flex justify-center z-10 pointer-events-none">
          <div className="w-full max-w-3xl bg-background shadow-xl rounded-full border p-1.5 flex items-center gap-2 pointer-events-auto transition-all duration-300 ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
            <Input
              className="flex-1 border-0 focus-visible:ring-0 shadow-none bg-transparent h-11 pl-4 rounded-full"
              placeholder={
                mode === "simulator"
                  ? "Digite uma mensagem como se fosse um cliente..."
                  : mode === "architect"
                  ? "Descreva a persona ou regras de comportamento..."
                  : "Pergunte 'Quantas mensagens tenho?' ou 'Como configurar o bot?'"
              }
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={simulateMutation.isPending}
            />
            <Button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || simulateMutation.isPending}
              size="icon"
              className="h-10 w-10 rounded-full shrink-0"
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
