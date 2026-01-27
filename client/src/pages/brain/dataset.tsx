import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Trash2,
  Pencil,
  Loader2,
  Search,
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function Dataset() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<any>(null);
  const [formData, setFormData] = useState({ question: "", answer: "" });
  const [searchTerm, setSearchTerm] = useState("");

  const { data: dataset = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/brain/dataset"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      await apiRequest("POST", "/api/brain/dataset", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brain/dataset"] });
      setIsDialogOpen(false);
      setFormData({ question: "", answer: "" });
      toast({ title: "Item adicionado", description: "Novo exemplo salvo no dataset." });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao adicionar item.", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof formData }) => {
      await apiRequest("PATCH", `/api/brain/dataset/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brain/dataset"] });
      setIsDialogOpen(false);
      setEditingEntry(null);
      setFormData({ question: "", answer: "" });
      toast({ title: "Item atualizado", description: "Exemplo atualizado com sucesso." });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao atualizar item.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/brain/dataset/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brain/dataset"] });
      toast({ title: "Item removido" });
    },
  });

  const importHistoryMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/migrate-history");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/brain/dataset"] });
      toast({
        title: "Importação concluída",
        description: `${data.migrated} itens migrados, ${data.skipped} ignorados.`
      });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao importar histórico.", variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!formData.question.trim() || !formData.answer.trim()) return;

    if (editingEntry) {
      updateMutation.mutate({ id: editingEntry.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const openEditDialog = (entry: any) => {
    setEditingEntry(entry);
    setFormData({ question: entry.question, answer: entry.answer });
    setIsDialogOpen(true);
  };

  const openCreateDialog = () => {
    setEditingEntry(null);
    setFormData({ question: "", answer: "" });
    setIsDialogOpen(true);
  };

  const filteredDataset = dataset.filter(
    (item) =>
      item.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.answer.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Memória & Dataset</h1>
          <p className="text-muted-foreground">
            Gerencie os exemplos de Perguntas e Respostas que guiam a IA (Few-Shot Learning).
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => importHistoryMutation.mutate()}
            disabled={importHistoryMutation.isPending}
          >
            {importHistoryMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Search className="h-4 w-4 mr-2" />
            )}
            Importar Histórico Antigo
          </Button>
          <Button onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Adicionar Exemplo
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Exemplos Cadastrados ({dataset.length})</CardTitle>
          <div className="flex items-center gap-2 mt-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar exemplos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredDataset.length === 0 ? (
            <div className="text-center p-8 text-muted-foreground">
              Nenhum exemplo encontrado. Adicione o primeiro!
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40%]">Pergunta / Entrada do Usuário</TableHead>
                  <TableHead className="w-[40%]">Resposta Ideal</TableHead>
                  <TableHead className="w-[20%] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDataset.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="align-top font-medium text-sm">
                      "{item.question}"
                    </TableCell>
                    <TableCell className="align-top text-sm text-muted-foreground">
                      "{item.answer}"
                    </TableCell>
                    <TableCell className="text-right align-top">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(item)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteMutation.mutate(item.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              {editingEntry ? "Editar Exemplo" : "Novo Exemplo"}
            </DialogTitle>
            <DialogDescription>
              A IA usará este par de pergunta/resposta como referência para situações similares.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Pergunta / Comentário do Usuário</Label>
              <Textarea
                placeholder="Ex: Qual o horário de funcionamento?"
                value={formData.question}
                onChange={(e) => setFormData({ ...formData, question: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Resposta Ideal</Label>
              <Textarea
                placeholder="Ex: Estamos abertos de segunda a sexta, das 9h às 18h."
                value={formData.answer}
                onChange={(e) => setFormData({ ...formData, answer: e.target.value })}
                className="min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
