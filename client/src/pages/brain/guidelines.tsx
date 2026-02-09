import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import {
  Send,
  Bot,
  User,
  Loader2,
  Plus,
  Trash2,
  Edit2,
  BookOpen,
  Info,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Guideline {
  id: number;
  userId: string;
  rule: string;
  priority: number;
  category: string;
  isActive: boolean;
  createdAt: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export default function Guidelines() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [editingGuideline, setEditingGuideline] = useState<Guideline | null>(null);
  const [pendingRule, setPendingRule] = useState("");
  const [selectedPriority, setSelectedPriority] = useState(3);
  const [selectedCategory, setSelectedCategory] = useState("geral");
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch guidelines
  const { data: guidelines = [], isLoading } = useQuery<Guideline[]>({
    queryKey: ["/api/brain/guidelines"],
  });

  // Fetch count
  const { data: countData } = useQuery<{ count: number; limit: number }>({
    queryKey: ["/api/brain/guidelines/count"],
  });

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // Refine rule mutation
  const refineMutation = useMutation({
    mutationFn: async (data: { message: string; history: ChatMessage[] }) => {
      const res = await apiRequest("POST", "/api/brain/refine-rule", {
        message: data.message,
        history: data.history,
      });
      return res.json();
    },
    onSuccess: (data) => {
      const botMsg: ChatMessage = {
        id: Date.now().toString(),
        role: "assistant",
        content: data.response,
      };
      setChatMessages((prev) => [...prev, botMsg]);
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Falha ao refinar regra com IA.",
        variant: "destructive",
      });
    },
  });

  // Add guideline mutation
  const addMutation = useMutation({
    mutationFn: async (data: { rule: string; priority: number; category: string }) => {
      await apiRequest("POST", "/api/brain/guidelines", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brain/guidelines"] });
      queryClient.invalidateQueries({ queryKey: ["/api/brain/guidelines/count"] });
      setIsDialogOpen(false);
      setIsChatOpen(false);
      setChatMessages([]);
      setPendingRule("");
      setSelectedPriority(3);
      setSelectedCategory("geral");
      toast({
        title: "Regra Adicionada",
        description: "A nova diretriz foi incluída nas suas regras.",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Falha ao adicionar regra.",
        variant: "destructive",
      });
    },
  });

  // Update guideline mutation
  const updateMutation = useMutation({
    mutationFn: async (data: { id: number; updates: Partial<Guideline> }) => {
      await apiRequest("PATCH", `/api/brain/guidelines/${data.id}`, data.updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brain/guidelines"] });
      setEditingGuideline(null);
      toast({
        title: "Regra Atualizada",
        description: "A diretriz foi atualizada com sucesso.",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Falha ao atualizar regra.",
        variant: "destructive",
      });
    },
  });

  // Delete guideline mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/brain/guidelines/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brain/guidelines"] });
      queryClient.invalidateQueries({ queryKey: ["/api/brain/guidelines/count"] });
      toast({
        title: "Regra Removida",
        description: "A diretriz foi excluída.",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Falha ao remover regra.",
        variant: "destructive",
      });
    },
  });

  const handleToggleActive = (guideline: Guideline) => {
    updateMutation.mutate({
      id: guideline.id,
      updates: { isActive: !guideline.isActive },
    });
  };

  const handleOpenChat = () => {
    setIsChatOpen(true);
    setChatMessages([]);
    setPendingRule("");
    setSelectedPriority(3);
    setSelectedCategory("geral");
  };

  const handleSendMessage = () => {
    if (!chatInput.trim()) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: chatInput.trim(),
    };

    setChatMessages((prev) => [...prev, userMsg]);
    refineMutation.mutate({
      message: chatInput.trim(),
      history: [...chatMessages, userMsg],
    });
    setChatInput("");
  };

  const handleApproveRule = () => {
    if (!chatMessages.length) return;
    
    // Get the last assistant message as the refined rule
    const lastAssistantMsg = [...chatMessages]
      .reverse()
      .find((msg) => msg.role === "assistant");
    
    if (lastAssistantMsg) {
      setPendingRule(lastAssistantMsg.content);
      setIsDialogOpen(true);
    }
  };

  const handleSaveRule = (priority: number, category: string) => {
    if (!pendingRule.trim()) return;
    
    addMutation.mutate({
      rule: pendingRule.trim(),
      priority,
      category,
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Diretrizes & Regras</h1>
          <p className="text-muted-foreground mt-2">
            Crie regras personalizadas para guiar o comportamento da IA. Use o mini chat para refinar suas diretrizes com ajuda da IA.
          </p>
        </div>
        <Button onClick={handleOpenChat} disabled={countData && countData.count >= countData.limit}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Diretriz
        </Button>
      </div>

      {/* Info Card */}
      <Card className="bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Info className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <CardTitle className="text-base">Como funcionam as Diretrizes</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            As diretrizes são regras que você define para orientar as respostas da IA. 
            Você pode criar novas regras usando o mini chat com IA, que ajuda a refinar e aprimorar suas diretrizes. 
            Cada regra pode ter uma prioridade (1-5) e ser ativada/desativada conforme necessário.
          </p>
        </CardContent>
      </Card>

      {/* Guidelines List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Suas Diretrizes</CardTitle>
            <Badge variant="secondary">
              {countData ? `${countData.count}/${countData.limit}` : "0"}
            </Badge>
          </div>
          <CardDescription>
            Gerencie suas regras personalizadas. Ative ou desative conforme necessário.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : guidelines.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <BookOpen className="h-16 w-16 mb-4 opacity-50" />
              <p>Nenhuma diretriz criada ainda.</p>
              <p className="text-sm mt-1">Clique em "Nova Diretriz" para começar.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {guidelines.map((guideline) => (
                <div
                  key={guideline.id}
                  className="p-4 border rounded-lg hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-start gap-4">
                    <Switch
                      checked={guideline.isActive}
                      onCheckedChange={() => handleToggleActive(guideline)}
                      disabled={updateMutation.isPending}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className="text-xs">
                          Prioridade: {guideline.priority}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {guideline.category}
                        </Badge>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{guideline.rule}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingGuideline(guideline)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteMutation.mutate(guideline.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingGuideline} onOpenChange={(open) => !open && setEditingGuideline(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Diretriz</DialogTitle>
            <DialogDescription>
              Modifique a regra, prioridade ou categoria.
            </DialogDescription>
          </DialogHeader>
          {editingGuideline && (
            <div className="space-y-4">
              <div>
                <Label>Regra</Label>
                <Textarea
                  value={editingGuideline.rule}
                  onChange={(e) =>
                    setEditingGuideline({ ...editingGuideline, rule: e.target.value })
                  }
                  rows={4}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Prioridade</Label>
                  <Select
                    value={String(editingGuideline.priority)}
                    onValueChange={(val) =>
                      setEditingGuideline({ ...editingGuideline, priority: +val })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map((p) => (
                        <SelectItem key={p} value={String(p)}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Categoria</Label>
                  <Select
                    value={editingGuideline.category}
                    onValueChange={(val) =>
                      setEditingGuideline({ ...editingGuideline, category: val })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="geral">Geral</SelectItem>
                      <SelectItem value="tom">Tom</SelectItem>
                      <SelectItem value="conteudo">Conteúdo</SelectItem>
                      <SelectItem value="estrutura">Estrutura</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingGuideline(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (editingGuideline) {
                  updateMutation.mutate({
                    id: editingGuideline.id,
                    updates: {
                      rule: editingGuideline.rule,
                      priority: editingGuideline.priority,
                      category: editingGuideline.category,
                    },
                  });
                }
              }}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Chat Dialog */}
      <Dialog open={isChatOpen} onOpenChange={setIsChatOpen}>
        <DialogContent className="max-w-3xl h-[600px] flex flex-col">
          <DialogHeader>
            <DialogTitle>Refinar Diretriz com IA</DialogTitle>
            <DialogDescription>
              Descreva a regra que você quer criar e refine-a com ajuda da IA.
            </DialogDescription>
          </DialogHeader>
          
          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto border rounded-lg p-4 space-y-4" ref={scrollRef}>
            {chatMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-50">
                <Bot className="h-16 w-16 mb-4" />
                <p>Comece descrevendo a diretriz que você quer criar.</p>
                <p className="text-sm mt-2">Exemplo: "Sempre responder de forma educada e profissional"</p>
              </div>
            ) : (
              chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-4 ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {msg.role === "assistant" && (
                    <div className="h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-primary/10 text-primary">
                      <Bot className="h-6 w-6" />
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
                        <p className="whitespace-pre-wrap text-sm leading-relaxed">
                          {msg.content}
                        </p>
                      ) : (
                        <MarkdownRenderer content={msg.content} />
                      )}
                    </div>
                  </div>

                  {msg.role === "user" && (
                    <div className="h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-muted">
                      <User className="h-6 w-6" />
                    </div>
                  )}
                </div>
              ))
            )}
            
            {refineMutation.isPending && (
              <div className="flex gap-4 justify-start">
                <div className="h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-primary/10 text-primary">
                  <Bot className="h-6 w-6" />
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Refinando...</span>
                </div>
              </div>
            )}
          </div>

          {/* Approval Prompt */}
          {chatMessages.length > 0 && chatMessages[chatMessages.length - 1]?.role === "assistant" && (
            <div className="bg-muted/50 p-3 rounded-lg border">
              <p className="text-sm font-medium mb-2">Quer aprovar ou fazer alguma modificação?</p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => textareaRef.current?.focus()}
                >
                  Modificar
                </Button>
                <Button
                  size="sm"
                  onClick={handleApproveRule}
                  className="bg-green-600 hover:bg-green-700"
                >
                  Aprovar e Continuar
                </Button>
              </div>
            </div>
          )}

          {/* Input */}
          <div className="flex gap-2">
            <Textarea
              ref={textareaRef}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Digite sua mensagem..."
              rows={2}
              className="resize-none"
            />
            <Button
              onClick={handleSendMessage}
              disabled={!chatInput.trim() || refineMutation.isPending}
              size="icon"
              className="h-[76px] w-12"
            >
              <Send className="h-5 w-5" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Save Rule Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Incluir nas Minhas Regras</DialogTitle>
            <DialogDescription>
              Configure a prioridade e categoria da sua nova diretriz.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Regra Refinada</Label>
              <div className="mt-2 p-3 bg-muted rounded-lg text-sm">
                <MarkdownRenderer content={pendingRule} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Prioridade</Label>
                <Select value={String(selectedPriority)} onValueChange={(val) => setSelectedPriority(+val)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 - Baixa</SelectItem>
                    <SelectItem value="2">2</SelectItem>
                    <SelectItem value="3">3 - Média</SelectItem>
                    <SelectItem value="4">4</SelectItem>
                    <SelectItem value="5">5 - Alta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Categoria</Label>
                <Select value={selectedCategory} onValueChange={(val) => setSelectedCategory(val)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="geral">Geral</SelectItem>
                    <SelectItem value="tom">Tom</SelectItem>
                    <SelectItem value="conteudo">Conteúdo</SelectItem>
                    <SelectItem value="estrutura">Estrutura</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => handleSaveRule(selectedPriority, selectedCategory)}
              disabled={addMutation.isPending}
            >
              {addMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Incluir nas Minhas Regras
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
