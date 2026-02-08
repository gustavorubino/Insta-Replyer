import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Globe,
  FileText,
  Plus,
  Trash2,
  Loader2,
  File,
  Upload,
  Instagram,
  RefreshCw,
  Sparkles,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function Sources() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [profileToDelete, setProfileToDelete] = useState<number | null>(null);

  // Simulated progress bar state
  const [syncProgress, setSyncProgress] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Progress bar animation constants
  // These create a logarithmic curve that slows down as it approaches the target
  const PROGRESS_TARGET = 95; // Never quite reaches 100% until API responds
  const MIN_INCREMENT = 0.5; // Minimum progress increment (keeps bar moving)
  const DECAY_RATE = 0.08; // How quickly increments slow down (8% of remaining)
  const RANDOM_VARIANCE = 1.5; // Random variation to make progress feel natural
  const PROGRESS_INTERVAL_MS = 800; // Update every 800ms for smooth animation

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, []);

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

  const { data: instagramProfiles = [], isLoading: profilesLoading } = useQuery<any[]>({
    queryKey: ["/api/knowledge/instagram-profiles"],
    refetchInterval: (query) => {
      const data = query.state.data as any[] | undefined;
      const hasProcessing = data?.some((p: any) => p.status === "pending" || p.status === "processing");
      return hasProcessing ? 2000 : false;
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

  // Sync official Instagram account with simulated progress
  const syncOfficialMutation = useMutation({
    mutationFn: async () => {
      // Start simulated progress
      setIsSyncing(true);
      setSyncProgress(10);

      progressIntervalRef.current = setInterval(() => {
        setSyncProgress((prev) => {
          // Logarithmic progress: slows down as it approaches target
          const remaining = PROGRESS_TARGET - prev;
          const increment = Math.max(MIN_INCREMENT, remaining * DECAY_RATE + Math.random() * RANDOM_VARIANCE);
          return Math.round(Math.min(prev + increment, PROGRESS_TARGET));
        });
      }, PROGRESS_INTERVAL_MS);

      // Add a timeout safety net
      const timeoutId = setTimeout(() => {
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
        }
        setIsSyncing(false);
        setSyncProgress(0);
        toast({ title: "Erro", description: "A sincronização demorou demais. Tente novamente.", variant: "destructive" });
      }, 120000); // 2 minute timeout

      try {
        const response = await apiRequest("POST", "/api/knowledge/sync-official", {});
        clearTimeout(timeoutId);
        
        // Check if response is ok before parsing
        if (!response.ok) {
          throw new Error(`API request failed with status ${response.status}`);
        }
        
        return response.json();
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    },
    onSuccess: (data: any) => {
      // Stop progress interval
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      
      // Jump to 100% (browser will animate the transition smoothly)
      setSyncProgress(100);

      // Reset after animation
      setTimeout(() => {
        setIsSyncing(false);
        setSyncProgress(0);
      }, 1500);

      queryClient.invalidateQueries({ queryKey: ["/api/knowledge/instagram-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/brain/dataset"] });
      toast({
        title: "✅ Sincronização Concluída",
        description: data.message || `${data.captionsCount} legendas sincronizadas!`,
      });
    },
    onError: (error: any) => {
      // Stop progress on error
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      setIsSyncing(false);
      setSyncProgress(0);

      let message = "Erro ao sincronizar conta.";
      try {
        const errorData = error?.message ? JSON.parse(error.message.substring(error.message.indexOf("{"))) : {};
        message = errorData.code === "NOT_CONNECTED"
          ? "Conecte sua conta Instagram primeiro na aba Conexão."
          : errorData.error || message;
      } catch (e) {
        // If error message parsing fails, use default message
      }
      toast({ title: "Erro", description: message, variant: "destructive" });
    },
  });

  // Generate personality from synced content
  const generatePersonalityMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/knowledge/generate-personality", {});
      return response;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: "🎭 Personalidade Gerada",
        description: data.message || "Sua personalidade foi clonada com sucesso!",
      });
    },
    onError: (error: any) => {
      const errorData = error?.message ? JSON.parse(error.message.substring(error.message.indexOf("{"))) : {};
      const message = errorData.code === "INSUFFICIENT_DATA"
        ? "Sincronize mais conteúdo antes de gerar a personalidade."
        : errorData.error || "Erro ao gerar personalidade.";
      toast({ title: "Erro", description: message, variant: "destructive" });
    },
  });

  const deleteInstagramProfileMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/knowledge/instagram-profiles/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge/instagram-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/brain/dataset"] });
      queryClient.invalidateQueries({ queryKey: ["/api/brain/media-library"] });
      queryClient.invalidateQueries({ queryKey: ["/api/brain/guidelines"] });
      setProfileToDelete(null);
      toast({
        title: "Perfil removido",
        description: "Todos os dados importados foram apagados do dataset."
      });
    },
    onError: () => {
      setProfileToDelete(null);
      toast({ title: "Erro", description: "Não foi possível remover o perfil.", variant: "destructive" });
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

  const getStatusBadge = (status: string, progress?: number, username?: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Concluído</Badge>;
      case "private":
        return (
          <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
            Perfil Privado
          </Badge>
        );
      case "error":
        return <Badge variant="destructive">Erro</Badge>;
      case "processing":
      case "pending":
        const progressValue = progress ?? 0;
        const displayUsername = username ? `@${username}` : "perfil";
        return (
          <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            {progressValue < 40
              ? `IA estudando ${displayUsername}...`
              : progressValue < 70
                ? `Extraindo posts...`
                : `Gerando entradas... ${progressValue}%`
            }
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

          {/* Instagram Profile Sync Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Instagram className="h-4 w-4" />
              <Label>Clonagem Automática de Personalidade</Label>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-2">
              {(() => {
                const hasCompletedProfile = instagramProfiles.some((p: any) => p.status === "completed");
                const isButtonDisabled = syncOfficialMutation.isPending || isSyncing || hasCompletedProfile;

                return (
                  <Button
                    onClick={() => syncOfficialMutation.mutate()}
                    disabled={isButtonDisabled}
                    className={
                      hasCompletedProfile
                        ? "flex-1 bg-green-600 disabled:bg-green-600 opacity-75 cursor-not-allowed"
                        : "flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                    }
                  >
                    {syncOfficialMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : hasCompletedProfile ? (
                      <CheckCircle className="h-4 w-4 mr-2" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    {hasCompletedProfile ? "Conta Sincronizada" : "Sincronizar Minha Conta Oficial"}
                  </Button>
                );
              })()}
              <Button
                onClick={() => generatePersonalityMutation.mutate()}
                disabled={generatePersonalityMutation.isPending || instagramProfiles.length === 0}
                variant="outline"
                className="flex-1 border-purple-300 dark:border-purple-700"
              >
                {generatePersonalityMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                Gerar Personalidade via IA
              </Button>
            </div>

            {/* Progress Bar - Shows during sync */}
            {isSyncing && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Sincronizando Instagram...
                  </span>
                  <span className="font-medium text-purple-600 dark:text-purple-400">
                    {syncProgress}%
                  </span>
                </div>
                <Progress
                  value={syncProgress}
                  className="h-2 bg-purple-100 dark:bg-purple-950"
                />
              </div>
            )}

            <div className="flex items-start gap-2 p-3 rounded-lg bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-200/50 dark:border-purple-800/50">
              <Sparkles className="h-4 w-4 text-purple-500 mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                Use sua conta Instagram conectada para clonar automaticamente seu tom de voz. A IA analisa suas legendas e gera uma personalidade única.
              </p>
            </div>
            {profilesLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : instagramProfiles.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum perfil sincronizado ainda.</p>
            ) : (
              <div className="space-y-2">
                {instagramProfiles.map((profile: any) => (
                  <div
                    key={profile.id}
                    className="flex flex-col gap-2 p-3 rounded-lg border"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Instagram className="h-4 w-4 shrink-0 text-pink-500" />
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-medium truncate">@{profile.username}</span>
                          {profile.status === "completed" && (
                            <span className="text-xs text-muted-foreground">
                              {profile.postsScraped || 0} posts • {profile.interactionCount || profile.datasetEntriesGenerated || 0} conversas
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(profile.status, profile.progress, profile.username)}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setProfileToDelete(profile.id)}
                          disabled={deleteInstagramProfileMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    {(profile.status === "error" || profile.status === "private") && profile.errorMessage && (
                      <div className={`text-xs p-2 rounded ${profile.status === "private"
                        ? "bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300"
                        : "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300"
                        }`}>
                        {profile.errorMessage}
                      </div>
                    )}
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

      {/* Confirmation Dialog for Instagram Profile Deletion */}
      <AlertDialog open={profileToDelete !== null} onOpenChange={(open) => !open && setProfileToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Confirmar Exclusão
            </AlertDialogTitle>
            <AlertDialogDescription>
              Ao desconectar, <strong>todos os dados e posts importados</strong> desta conta serão apagados permanentemente do dataset. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => profileToDelete && deleteInstagramProfileMutation.mutate(profileToDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteInstagramProfileMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Sim, Apagar Tudo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
