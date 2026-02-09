import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Globe,
  Plus,
  Trash2,
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
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function Sources() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newLinkUrl, setNewLinkUrl] = useState("");

  const { data: knowledgeLinks = [], isLoading: linksLoading } = useQuery<any[]>({
    queryKey: ["/api/knowledge/links"],
    refetchInterval: (query) => {
      const data = query.state.data as any[] | undefined;
      const hasProcessing = data?.some((l: any) => l.status === "pending" || l.status === "processing");
      return hasProcessing ? 1000 : false;
    },
  });

  const addLinkMutation = useMutation({
    mutationFn: async (url: string) => {
      await apiRequest("POST", "/api/knowledge/links", { url });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge/links"] });
      setNewLinkUrl("");
      toast({ title: "Link adicionado", description: "O conteúdo está sendo processado." });
    },
    onError: () => {
      toast({ title: "Erro", description: "Não foi possível adicionar o link.", variant: "destructive" });
    },
  });

  const deleteLinkMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/knowledge/links/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge/links"] });
      toast({ title: "Link removido" });
    },
  });

  const getStatusBadge = (status: string, progress?: number) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Concluído</Badge>;
      case "error":
        return <Badge variant="destructive">Erro</Badge>;
      case "processing":
      case "pending":
        return (
          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Processando...
          </Badge>
        );
      default:
        return (
          <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
            {progress ?? 0}%
          </Badge>
        );
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Fontes de Conhecimento</h1>
          <p className="text-muted-foreground">
            Adicione links e arquivos para treinar a IA com informações específicas do seu negócio.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Base de Conhecimento</CardTitle>
          <CardDescription>
            Gerencie o conteúdo que a IA usa para responder perguntas específicas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              <Label>Links de Treinamento</Label>
            </div>
            <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
              <Globe className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
              <p className="text-sm text-blue-900 dark:text-blue-100">
                Adicione links de páginas relevantes (seu site, blog, portfolio) para complementar os dados do Instagram e melhorar a clonagem de personalidade.
              </p>
            </div>
            <div className="flex gap-2">
              <Input
                type="url"
                placeholder="https://exemplo.com/pagina"
                value={newLinkUrl}
                onChange={(e) => setNewLinkUrl(e.target.value)}
              />
              <Button
                onClick={() => {
                  if (newLinkUrl.trim()) {
                    addLinkMutation.mutate(newLinkUrl.trim());
                  }
                }}
                disabled={!newLinkUrl.trim() || addLinkMutation.isPending}
              >
                {addLinkMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
              </Button>
            </div>
            {linksLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : knowledgeLinks.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum link adicionado ainda.</p>
            ) : (
              <div className="space-y-2">
                {knowledgeLinks.map((link: any) => (
                  <div
                    key={link.id}
                    className="flex items-center justify-between gap-2 p-3 rounded-lg border"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="text-sm truncate">{link.url}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(link.status, link.progress)}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteLinkMutation.mutate(link.id)}
                        disabled={deleteLinkMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator />
        </CardContent>
      </Card>
    </div>
  );
}
