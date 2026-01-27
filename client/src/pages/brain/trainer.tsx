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
} from "lucide-react";
import {
  Card,
  CardContent,
  CardFooter,
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden border-2">
        <CardContent
          className="flex-1 overflow-y-auto p-4 space-y-4"
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
                className={`flex gap-3 ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {msg.role === "assistant" && (
                  <div
                    className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      mode === "architect"
                        ? "bg-purple-100 text-purple-600"
                        : mode === "copilot"
                        ? "bg-blue-100 text-blue-600"
                        : "bg-primary/10 text-primary"
                    }`}
                  >
                    {mode === "architect" ? (
                      <PencilRuler className="h-5 w-5" />
                    ) : mode === "copilot" ? (
                      <Cpu className="h-5 w-5" />
                    ) : (
                      <Bot className="h-5 w-5" />
                    )}
                  </div>
                )}

                <div
                  className={`flex flex-col gap-1 max-w-[80%] ${
                    msg.role === "user" ? "items-end" : "items-start"
                  }`}
                >
                  <div
                    className={`p-3 rounded-lg ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
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

                {msg.role === "user" && (
                  <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                    <User className="h-5 w-5 text-secondary-foreground" />
                  </div>
                )}
              </div>
            ))
          )}
          {simulateMutation.isPending && (
            <div className="flex justify-start gap-3">
              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter className="p-4 border-t bg-card">
          <div className="flex w-full gap-2">
            <Input
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
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </CardFooter>
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
