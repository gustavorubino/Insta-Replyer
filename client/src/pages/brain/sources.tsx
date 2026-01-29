import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// ... (existing imports)

export default function Sources() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDisconnectDialogOpen, setIsDisconnectDialogOpen] = useState(false);

  // ... (existing queries)

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/brain/disconnect", {});
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Conta Desconectada",
        description: "Todos os dados foram limpos com sucesso.",
      });
      setIsDisconnectDialogOpen(false);
      // Force reload to clear all states and caches properly
      window.location.reload();
    },
    onError: (error) => {
      toast({
        title: "Erro ao desconectar",
        description: "Não foi possível desconectar a conta.",
        variant: "destructive",
      });
    },
  });

  // ... (rest of the file until the Instagram Card)

  {/* Connected State */ }
  {
    user?.instagramAccessToken && (
      <div className="flex flex-col items-center justify-center py-6 space-y-4">
        <div className="flex items-center gap-4 w-full p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border">
          <div className="h-12 w-12 bg-gradient-to-tr from-purple-500 to-orange-500 rounded-full flex items-center justify-center text-white">
            <Instagram className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-lg">@{user.instagramUsername || "instagram_user"}</h3>
            <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
              <span className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
              Conta Oficial Conectada
            </p>
          </div>

          <Dialog open={isDisconnectDialogOpen} onOpenChange={setIsDisconnectDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" size="sm">
                Desconectar
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Desconectar Conta Oficial?</DialogTitle>
                <DialogDescription>
                  Esta ação é irreversível. Todos os 50 posts e o histórico de aprendizado (incluindo Threads) serão apagados do sistema.
                  <br /><br />
                  Suas correções manuais (Ouro) serão preservadas.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDisconnectDialogOpen(false)}>Cancelar</Button>
                <Button
                  variant="destructive"
                  onClick={() => disconnectMutation.mutate()}
                  blocks={disconnectMutation.isPending}
                >
                  {disconnectMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  Sim, Desconectar e Limpar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-2 gap-4 w-full">
          <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg text-center border">
            <span className="block text-2xl font-bold">{stats?.mediaLibrary?.count || 0}</span>
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Posts</span>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg text-center border">
            <span className="block text-2xl font-bold">{stats?.interactionDialect?.count || 0}</span>
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Interações</span>
          </div>
        </div>

        <Separator />

        <div className="flex gap-4 w-full">
          {!isSyncing ? (
            <Button
              onClick={startSync}
              className="flex-1 bg-purple-600 hover:bg-purple-700"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Sincronizar Novamente
            </Button>
          ) : (
            <div className="w-full space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{syncStatus}</span>
                <span>{syncProgress}%</span>
              </div>
              <Progress value={syncProgress} className="h-2" />
              <p className="text-xs text-center text-muted-foreground animate-pulse">
                Isso pode levar alguns minutos...
              </p>
            </div>
          )}

          <Button variant="outline" className="flex-1" disabled>
            <Sparkles className="h-4 w-4 mr-2" />
            Regerar Personalidade
          </Button>
        </div>
      </div>
    )
  }

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

  // Sync official Instagram account
  const syncOfficialMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/knowledge/sync-official", {});
      return response;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge/instagram-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/brain/dataset"] });
      toast({
        title: "✅ Sincronização Concluída",
        description: data.message || `${data.captionsCount} legendas sincronizadas!`,
      });
    },
    onError: (error: any) => {
      const errorData = error?.message ? JSON.parse(error.message.substring(error.message.indexOf("{"))) : {};
      const message = errorData.code === "NOT_CONNECTED"
        ? "Conecte sua conta Instagram primeiro na aba Conexão."
        : errorData.error || "Erro ao sincronizar conta.";
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
      toast({ title: "Perfil removido" });
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

            {/* Sync Status & Action Area */}
            {profilesLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : instagramProfiles.length > 0 ? (
              // CONNECTED STATE
              <div className="space-y-4">
                <div className="flex flex-col gap-2 p-4 rounded-lg border bg-card text-card-foreground shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-500 p-[2px]">
                        <div className="h-full w-full rounded-full bg-white dark:bg-black p-0.5 overflow-hidden">
                          <Instagram className="h-full w-full text-zinc-800 dark:text-zinc-200" />
                        </div>
                      </div>
                      <div>
                        <h3 className="font-medium">@{instagramProfiles[0].username}</h3>
                        <p className="text-sm text-muted-foreground">Conta Oficial Conectada</p>
                      </div>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={async () => {
                        if (confirm("Tem certeza? Isso apagará todo o conhecimento clonado do Instagram.")) {
                          await apiRequest("POST", "/api/brain/disconnect", {});
                          queryClient.invalidateQueries({ queryKey: ["/api/knowledge/instagram-profiles"] });
                          queryClient.invalidateQueries({ queryKey: ["/api/brain/dataset"] });
                          toast({ title: "Desconectado", description: "Todos os dados foram limpos." });
                        }
                      }}
                    >
                      Desconectar
                    </Button>
                  </div>

                  {instagramProfiles[0].status === 'completed' && (
                    <div className="flex gap-4 mt-2">
                      <div className="flex flex-col">
                        <span className="text-2xl font-bold">{instagramProfiles[0].postsScraped || 0}</span>
                        <span className="text-xs text-muted-foreground uppercase tracking-wider">Posts</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-2xl font-bold">{instagramProfiles[0].datasetEntriesGenerated || 0}</span>
                        <span className="text-xs text-muted-foreground uppercase tracking-wider">Interações</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      // Trigger SSE Sync
                      const eventSource = new EventSource("/api/brain/sync-knowledge/stream");
                      setIsUploadingFile(true); // Reusing this state for "isSyncing" to block UI
                      setUploadProgress(0); // Reusing for progress bar

                      // We can use a toast or local state to show detailed status
                      let currentStep = "Iniciando...";

                      eventSource.onmessage = (event) => {
                        const data = JSON.parse(event.data);

                        if (data.type === 'progress') {
                          setUploadProgress(data.progress);
                          currentStep = data.step;
                          // Optional: update a specific status text state
                        } else if (data.type === 'complete') {
                          eventSource.close();
                          setIsUploadingFile(false);
                          setUploadProgress(100);
                          queryClient.invalidateQueries({ queryKey: ["/api/knowledge/instagram-profiles"] });
                          queryClient.invalidateQueries({ queryKey: ["/api/brain/dataset"] });
                          toast({ title: "Sincronização Concluída!", description: `Analisados: ${data.mediaCount} posts, ${data.interactionCount} interações.` });
                        } else if (data.type === 'error') {
                          eventSource.close();
                          setIsUploadingFile(false);
                          toast({ title: "Erro na Sincronização", description: data.message, variant: "destructive" });
                        }
                      };

                      eventSource.onerror = () => {
                        eventSource.close();
                        setIsUploadingFile(false);
                        // toast({ title: "Conexão perdida", variant: "destructive" });
                      };
                    }}
                    disabled={isUploadingFile} // isSyncing
                    className="flex-1"
                  >
                    {isUploadingFile ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {uploadProgress}% Sincronizando...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Sincronizar Novamente
                      </>
                    )}
                  </Button>

                  <Button
                    onClick={() => generatePersonalityMutation.mutate()}
                    disabled={generatePersonalityMutation.isPending}
                    variant="outline"
                    className="flex-1"
                  >
                    {generatePersonalityMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                    Regerar Personalidade
                  </Button>
                </div>

                {isUploadingFile && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Progresso</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-500 ease-out"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                    <p className="text-xs text-center text-muted-foreground animate-pulse">
                      Isso pode levar alguns minutos. Mantenha esta página aberta.
                    </p>
                  </div>
                )}

              </div>
            ) : (
              // DISCONNECTED STATE
              <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg text-center space-y-4">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                  <Instagram className="h-6 w-6 text-muted-foreground" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-medium">Nenhuma conta conectada</h3>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                    Conecte sua conta do Instagram para permitir que a IA aprenda com seus posts e interações reais.
                  </p>
                </div>
                <Button
                  onClick={() => {
                    // Redirect to connection (or setup flow)
                    // For now assuming the user has "connected" via the Connection tab, so we just show the sync button to "start"
                    // But actually, if instagramProfiles is empty, it usually means we need to "Sync Official" first time.
                    syncOfficialMutation.mutate();
                  }}
                  disabled={syncOfficialMutation.isPending}
                >
                  {syncOfficialMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Instagram className="h-4 w-4 mr-2" />}
                  Conectar Conta Oficial
                </Button>
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
