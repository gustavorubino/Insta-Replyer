import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import {
  Plus,
  Trash2,
  Edit2,
  BookOpen,
  Loader2,
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

export default function Guidelines() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingGuideline, setEditingGuideline] = useState<Guideline | null>(null);
  const [newRule, setNewRule] = useState("");
  const [selectedPriority, setSelectedPriority] = useState(3);
  const [selectedCategory, setSelectedCategory] = useState("geral");

  // Fetch guidelines
  const { data: guidelines = [], isLoading } = useQuery<Guideline[]>({
    queryKey: ["/api/brain/guidelines"],
  });

  // Fetch count
  const { data: countData } = useQuery<{ count: number; limit: number }>({
    queryKey: ["/api/brain/guidelines/count"],
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
      setNewRule("");
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

  const handleOpenDialog = () => {
    setNewRule("");
    setSelectedPriority(3);
    setSelectedCategory("geral");
    setIsDialogOpen(true);
  };

  const handleSaveRule = () => {
    if (!newRule.trim()) return;
    
    addMutation.mutate({
      rule: newRule.trim(),
      priority: selectedPriority,
      category: selectedCategory,
    });
  };

  return (
    <div className="flex flex-col h-full p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Diretrizes & Regras</h1>
          <p className="text-muted-foreground mt-2">
            Gerencie regras personalizadas para guiar o comportamento da IA.
          </p>
        </div>
        <Button onClick={handleOpenDialog} disabled={countData && countData.count >= countData.limit}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Diretriz
        </Button>
      </div>

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

      {/* Add Guideline Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Diretriz</DialogTitle>
            <DialogDescription>
              Configure a regra, prioridade e categoria da sua nova diretriz.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Regra</Label>
              <Textarea
                value={newRule}
                onChange={(e) => setNewRule(e.target.value)}
                placeholder="Descreva a regra que você quer criar..."
                rows={4}
              />
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
              onClick={handleSaveRule}
              disabled={addMutation.isPending || !newRule.trim()}
            >
              {addMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Adicionar Diretriz
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
