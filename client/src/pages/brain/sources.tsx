import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Globe,
  FileText,
  Plus,
  Trash2,
  Loader2,
  File,
  Upload,
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
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const { data: knowledgeLinks = [], isLoading: linksLoading } = useQuery<any[]>({
    queryKey: ["/api/knowledge/links"],
    refetchInterval: (query) => {
      const data = query.state.data as any[] | undefined;
      const hasProcessing = data?.some((l: any) => l.status === "pending" || l.status === "processing");
      return hasProcessing ? 1000 : false;
    },
  });

  const { data: knowledgeFiles = [], isLoading: filesLoading } = useQuery<any[]>({
    queryKey: ["/api/knowledge/files"],
    refetchInterval: (query) => {
      const data = query.state.data as any[] | undefined;
      const hasProcessing = data?.some((f: any) => f.status === "pending" || f.status === "processing");
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

  const deleteFileMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/knowledge/files/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge/files"] });
      toast({ title: "Arquivo removido" });
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingFile(true);
    setUploadProgress(0);

    try {
      // Step 1: Get presigned URL (5%)
      setUploadProgress(5);
      const response = await fetch("/api/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type || "application/octet-stream",
        }),
      });

      if (!response.ok) {
        throw new Error("Falha ao obter URL de upload");
      }

      const { uploadURL, objectPath } = await response.json();
      setUploadProgress(10);

      // Step 2: Upload file with progress tracking (10-90%)
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) {
            const percentComplete = Math.round((event.loaded / event.total) * 80) + 10;
            setUploadProgress(Math.min(percentComplete, 90));
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error("Falha ao fazer upload do arquivo"));
          }
        });

        xhr.addEventListener("error", () => {
          reject(new Error("Erro de conexão durante upload"));
        });

        xhr.open("PUT", uploadURL);
        xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
        xhr.send(file);
      });

      // Step 3: Register file (95%)
      setUploadProgress(95);
      await apiRequest("POST", "/api/knowledge/files", {
        fileName: file.name,
        fileType: file.type,
        objectPath,
      });

      setUploadProgress(100);
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge/files"] });
      toast({ title: "Arquivo enviado", description: "O conteúdo está sendo processado." });
    } catch (error) {
      toast({ title: "Erro", description: "Não foi possível enviar o arquivo.", variant: "destructive" });
    } finally {
      setIsUploadingFile(false);
      setUploadProgress(0);
      e.target.value = "";
    }
  };

  const getStatusBadge = (status: string, progress?: number) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Concluído</Badge>;
      case "error":
        return <Badge variant="destructive">Erro</Badge>;
      default:
        const progressValue = progress ?? 0;
        return (
          <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
            Processando... {progressValue}%
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

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <Label>Arquivos de Treinamento</Label>
            </div>
            <div>
              <input
                type="file"
                accept=".pdf,.txt"
                onChange={handleFileUpload}
                disabled={isUploadingFile}
                className="hidden"
                id="knowledge-file-upload"
              />
              <Button
                variant="outline"
                onClick={() => document.getElementById("knowledge-file-upload")?.click()}
                disabled={isUploadingFile}
              >
                {isUploadingFile ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                {isUploadingFile ? `Enviando... ${uploadProgress}%` : "Enviar Arquivo"}
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                Formatos aceitos: PDF, TXT
              </p>
            </div>
            {filesLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : knowledgeFiles.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum arquivo enviado ainda.</p>
            ) : (
              <div className="space-y-2">
                {knowledgeFiles.map((file: any) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between gap-2 p-3 rounded-lg border"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <File className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="text-sm truncate">{file.fileName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(file.status, file.progress)}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteFileMutation.mutate(file.id)}
                        disabled={deleteFileMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
