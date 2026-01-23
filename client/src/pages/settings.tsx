import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearch } from "wouter";
import {
  Link as LinkIcon,
  Bot,
  Brain,
  Save,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  ExternalLink,
  Database,
  FileText,
  Plus,
  Trash2,
  Loader2,
  Globe,
  File,
  Upload,
} from "lucide-react";
import { SiInstagram } from "react-icons/si";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/i18n";
import { Input } from "@/components/ui/input";

interface SettingsData {
  instagramConnected: boolean;
  instagramUsername?: string;
  instagramAccountId?: string;
  operationMode: "manual" | "semi_auto" | "auto";
  confidenceThreshold: number;
  systemPrompt: string;
  autoReplyEnabled: boolean;
  aiTone?: "professional" | "friendly" | "casual";
}

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const searchString = useSearch();
  const [isConnecting, setIsConnecting] = useState(false);
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const { t } = useLanguage();

  const { data: settings, isLoading } = useQuery<SettingsData>({
    queryKey: ["/api/settings"],
  });

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

  const { data: learningStats } = useQuery<{ count: number }>({
    queryKey: ["/api/learning/stats"],
  });

  const [localSettings, setLocalSettings] = useState<SettingsData | null>(null);

  useEffect(() => {
    if (settings) {
      setLocalSettings(settings);
    }
  }, [settings]);

  // Check for Instagram connection result from URL params
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    if (params.get("instagram_connected") === "true") {
      toast({
        title: t.settings.errors.instagramConnected,
        description: t.settings.errors.instagramConnectedDesc,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      // Clean up URL
      window.history.replaceState({}, "", "/settings");
    }
    const error = params.get("instagram_error");
    if (error) {
      let errorMessage = t.settings.errors.genericError;
      if (error === "no_pages_found") {
        errorMessage = t.settings.errors.noPages;
      } else if (error === "no_instagram_business_account") {
        errorMessage = t.settings.errors.noBusinessAccount;
      } else if (error === "session_expired") {
        errorMessage = t.settings.errors.sessionExpired;
      } else if (error === "credentials_missing") {
        errorMessage = t.settings.errors.credentialsMissing;
      }
      toast({
        title: t.settings.errors.connectionError,
        description: errorMessage,
        variant: "destructive",
      });
      window.history.replaceState({}, "", "/settings");
    }
  }, [searchString, toast, queryClient, t]);

  const saveMutation = useMutation({
    mutationFn: async (newSettings: Partial<SettingsData>) => {
      await apiRequest("PATCH", "/api/settings", newSettings);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: t.settings.saved,
        description: t.settings.savedDesc,
      });
    },
    onError: () => {
      toast({
        title: t.common.error,
        description: t.settings.errorSaving,
        variant: "destructive",
      });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/instagram/disconnect");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: t.settings.connection.disconnected,
        description: t.settings.connection.disconnectedDesc,
      });
    },
    onError: () => {
      toast({
        title: t.common.error,
        description: t.settings.errors.disconnectError,
        variant: "destructive",
      });
    },
  });

  const refreshProfileMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/instagram/refresh-profile");
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      if (data.updated) {
        toast({
          title: t.settings.connection.profileUpdated,
          description: t.settings.connection.profileUpdatedDesc,
        });
      } else {
        toast({
          title: t.settings.connection.profileVerified,
          description: t.settings.connection.profileVerifiedDesc,
        });
      }
    },
    onError: () => {
      toast({
        title: t.common.error,
        description: t.settings.errors.refreshError,
        variant: "destructive",
      });
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

  const handleConnectInstagram = async () => {
    setIsConnecting(true);
    try {
      const response = await fetch("/api/instagram/auth", {
        credentials: "include",
      });
      const data = await response.json();
      
      if (data.error) {
        toast({
          title: t.common.error,
          description: data.error,
          variant: "destructive",
        });
        setIsConnecting(false);
        return;
      }

      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch (error) {
      toast({
        title: t.common.error,
        description: t.settings.errors.startConnectionError,
        variant: "destructive",
      });
      setIsConnecting(false);
    }
  };

  const handleSave = () => {
    if (localSettings) {
      saveMutation.mutate(localSettings);
    }
  };

  const hasChanges =
    localSettings && settings
      ? JSON.stringify(localSettings) !== JSON.stringify(settings)
      : false;

  if (isLoading || !localSettings) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t.settings.title}</h1>
          <p className="text-muted-foreground">
            {t.settings.subtitle}
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={!hasChanges || saveMutation.isPending}
          data-testid="button-save-settings"
        >
          <Save className="h-4 w-4 mr-2" />
          {saveMutation.isPending ? t.settings.saving : t.settings.saveChanges}
        </Button>
      </div>

      <Tabs defaultValue="connection" className="space-y-6">
        <TabsList>
          <TabsTrigger value="connection" data-testid="tab-connection">
            <LinkIcon className="h-4 w-4 mr-2" />
            {t.settings.tabs.connection}
          </TabsTrigger>
          <TabsTrigger value="mode" data-testid="tab-mode">
            <Bot className="h-4 w-4 mr-2" />
            {t.settings.tabs.mode}
          </TabsTrigger>
          <TabsTrigger value="ai" data-testid="tab-ai">
            <Brain className="h-4 w-4 mr-2" />
            {t.settings.tabs.ai}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="connection" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SiInstagram className="h-5 w-5" />
                {t.settings.connection.title}
              </CardTitle>
              <CardDescription>
                {t.settings.connection.description}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {localSettings.instagramConnected ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-lg border bg-green-50 dark:bg-green-900/20">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <div>
                        <p className="font-medium text-green-800 dark:text-green-400">
                          {t.settings.connection.connected}
                        </p>
                        <p className="text-sm text-green-700 dark:text-green-500">
                          @{localSettings.instagramUsername || (localSettings.instagramAccountId ? `ID: ${localSettings.instagramAccountId}` : "your_account")}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => refreshProfileMutation.mutate()}
                        disabled={refreshProfileMutation.isPending}
                        data-testid="button-refresh-profile"
                        title={t.settings.connection.refreshProfile}
                      >
                        <RefreshCw className={`h-4 w-4 ${refreshProfileMutation.isPending ? 'animate-spin' : ''}`} />
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => disconnectMutation.mutate()}
                        disabled={disconnectMutation.isPending}
                        data-testid="button-disconnect-instagram"
                      >
                        {disconnectMutation.isPending ? t.settings.connection.disconnecting : t.settings.connection.disconnect}
                      </Button>
                    </div>
                  </div>
                  
                  <div className="p-4 rounded-lg border bg-blue-50 dark:bg-blue-900/20">
                    <p className="font-medium text-blue-800 dark:text-blue-400 mb-2">
                      {t.settings.connection.howToVerify}
                    </p>
                    <ol className="text-sm text-blue-700 dark:text-blue-500 space-y-1 list-decimal list-inside">
                      <li>{t.settings.connection.verifyStep1}</li>
                      <li>{t.settings.connection.verifyStep2}</li>
                      <li>{t.settings.connection.verifyStep3}</li>
                    </ol>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>{t.settings.connection.notConnected}</AlertTitle>
                    <AlertDescription>
                      {t.settings.connection.notConnectedDesc}
                    </AlertDescription>
                  </Alert>
                  <Button 
                    onClick={handleConnectInstagram}
                    disabled={isConnecting}
                    data-testid="button-connect-instagram"
                  >
                    <SiInstagram className="h-4 w-4 mr-2" />
                    {isConnecting ? t.settings.connection.connecting : t.settings.connection.connect}
                  </Button>
                </div>
              )}

              <Separator />

              <div className="space-y-2">
                <Label>{t.settings.connection.documentation}</Label>
                <p className="text-sm text-muted-foreground">
                  {t.settings.connection.docDescription}
                </p>
                <Button variant="ghost" className="px-0 h-auto" asChild>
                  <a
                    href="https://developers.facebook.com/docs/instagram-api"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t.settings.connection.viewDocs}
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mode" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t.settings.mode.title}</CardTitle>
              <CardDescription>
                {t.settings.mode.description}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div
                  className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                    localSettings.operationMode === "manual"
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/50"
                  }`}
                  onClick={() =>
                    setLocalSettings({ ...localSettings, operationMode: "manual" })
                  }
                  data-testid="option-manual-mode"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`h-4 w-4 rounded-full border-2 mt-0.5 ${
                        localSettings.operationMode === "manual"
                          ? "border-primary bg-primary"
                          : "border-muted-foreground"
                      }`}
                    >
                      {localSettings.operationMode === "manual" && (
                        <div className="h-full w-full flex items-center justify-center">
                          <div className="h-1.5 w-1.5 rounded-full bg-white"></div>
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium">{t.settings.mode.manual}</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        {t.settings.mode.manualDesc}
                      </p>
                    </div>
                  </div>
                </div>

                <div
                  className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                    localSettings.operationMode === "semi_auto"
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/50"
                  }`}
                  onClick={() =>
                    setLocalSettings({
                      ...localSettings,
                      operationMode: "semi_auto",
                    })
                  }
                  data-testid="option-semi-auto-mode"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`h-4 w-4 rounded-full border-2 mt-0.5 ${
                        localSettings.operationMode === "semi_auto"
                          ? "border-primary bg-primary"
                          : "border-muted-foreground"
                      }`}
                    >
                      {localSettings.operationMode === "semi_auto" && (
                        <div className="h-full w-full flex items-center justify-center">
                          <div className="h-1.5 w-1.5 rounded-full bg-white"></div>
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-medium">{t.settings.mode.semiAuto}</h4>
                        <Badge variant="secondary" className="text-xs">
                          {t.settings.mode.recommended}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {t.settings.mode.semiAutoDesc}
                      </p>
                      {localSettings.operationMode === "semi_auto" && (
                        <div className="mt-4 pt-4 border-t" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-between mb-2">
                            <Label>{t.settings.mode.confidenceThreshold}</Label>
                            <span className="text-sm font-medium">
                              {localSettings.confidenceThreshold}%
                            </span>
                          </div>
                          <Slider
                            value={[localSettings.confidenceThreshold]}
                            onValueChange={([value]) =>
                              setLocalSettings({
                                ...localSettings,
                                confidenceThreshold: value,
                              })
                            }
                            min={50}
                            max={95}
                            step={5}
                            className="w-full"
                            data-testid="slider-confidence-threshold"
                          />
                          <p className="text-xs text-muted-foreground mt-2">
                            {t.settings.mode.confidenceDesc.replace(/\{threshold\}/g, String(localSettings.confidenceThreshold))}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div
                  className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                    localSettings.operationMode === "auto"
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/50"
                  }`}
                  onClick={() =>
                    setLocalSettings({
                      ...localSettings,
                      operationMode: "auto",
                    })
                  }
                  data-testid="option-auto-mode"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`h-4 w-4 rounded-full border-2 mt-0.5 ${
                        localSettings.operationMode === "auto"
                          ? "border-primary bg-primary"
                          : "border-muted-foreground"
                      }`}
                    >
                      {localSettings.operationMode === "auto" && (
                        <div className="h-full w-full flex items-center justify-center">
                          <div className="h-1.5 w-1.5 rounded-full bg-white"></div>
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-medium">{t.settings.mode.auto}</h4>
                        <Badge variant="outline" className="text-xs border-amber-500 text-amber-600">
                          {t.settings.mode.trainedAI}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {t.settings.mode.autoDesc}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai" className="space-y-4">
          {/* Status do Treinamento da IA */}
          <Card className="border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                <CardTitle className="text-green-800 dark:text-green-300">Status do Treinamento da IA</CardTitle>
              </div>
              <CardDescription>
                Resumo das configurações que a IA está utilizando para gerar respostas.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex items-start gap-2 p-3 rounded-lg bg-background border">
                  <Brain className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">Prompt do Sistema</p>
                    <p className="text-xs text-muted-foreground">
                      {localSettings.systemPrompt?.trim() 
                        ? `${localSettings.systemPrompt.length} caracteres configurados`
                        : "Não configurado"}
                    </p>
                  </div>
                  {localSettings.systemPrompt?.trim() ? (
                    <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0" />
                  )}
                </div>
                <div className="flex items-start gap-2 p-3 rounded-lg bg-background border">
                  <Database className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">Base de Conhecimento</p>
                    <p className="text-xs text-muted-foreground">
                      {(() => {
                        const linksCompleted = knowledgeLinks.filter((l: any) => l.status === "completed").length;
                        const filesCompleted = knowledgeFiles.filter((f: any) => f.status === "completed").length;
                        if (linksCompleted === 0 && filesCompleted === 0) {
                          return "Nenhum conteúdo processado";
                        }
                        const parts = [];
                        if (linksCompleted > 0) parts.push(`${linksCompleted} link${linksCompleted > 1 ? 's' : ''}`);
                        if (filesCompleted > 0) parts.push(`${filesCompleted} arquivo${filesCompleted > 1 ? 's' : ''}`);
                        return parts.join(' + ') + ' processado' + (linksCompleted + filesCompleted > 1 ? 's' : '');
                      })()}
                    </p>
                  </div>
                  {knowledgeLinks.filter((l: any) => l.status === "completed").length > 0 || 
                   knowledgeFiles.filter((f: any) => f.status === "completed").length > 0 ? (
                    <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0" />
                  )}
                </div>
                <div className="flex items-start gap-2 p-3 rounded-lg bg-background border">
                  <Bot className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">Aprendizado</p>
                    <p className="text-xs text-muted-foreground">
                      {learningStats?.count 
                        ? `${learningStats.count} correç${learningStats.count === 1 ? 'ão' : 'ões'} realizadas`
                        : "Nenhuma correção ainda"}
                    </p>
                  </div>
                  {learningStats?.count && learningStats.count > 0 ? (
                    <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0" />
                  )}
                </div>
                <div className="flex items-start gap-2 p-3 rounded-lg bg-background border">
                  <RefreshCw className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">Modo de Operação</p>
                    <p className="text-xs text-muted-foreground">
                      {localSettings.operationMode === "manual" && "Manual (100% aprovação)"}
                      {localSettings.operationMode === "semi_auto" && `Semi-Automático (≥${localSettings.confidenceThreshold}% auto)`}
                      {localSettings.operationMode === "auto" && "Automático (todas respostas)"}
                    </p>
                  </div>
                  <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t.settings.ai.systemPrompt}</CardTitle>
              <CardDescription>
                {t.settings.ai.systemPromptDesc}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={localSettings.systemPrompt}
                onChange={(e) =>
                  setLocalSettings({
                    ...localSettings,
                    systemPrompt: e.target.value,
                  })
                }
                placeholder={t.settings.ai.systemPromptPlaceholder}
                className="min-h-[150px]"
                data-testid="textarea-system-prompt"
              />
              <p className="text-xs text-muted-foreground">
                {t.settings.ai.systemPromptHelper}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Base de Conhecimento</CardTitle>
              <CardDescription>
                Adicione links e arquivos para treinar a IA com informações específicas do seu negócio.
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
                    data-testid="input-knowledge-link"
                  />
                  <Button
                    onClick={() => {
                      if (newLinkUrl.trim()) {
                        addLinkMutation.mutate(newLinkUrl.trim());
                      }
                    }}
                    disabled={!newLinkUrl.trim() || addLinkMutation.isPending}
                    data-testid="button-add-knowledge-link"
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
                        data-testid={`knowledge-link-${link.id}`}
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
                            data-testid={`button-delete-link-${link.id}`}
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
                    data-testid="input-knowledge-file"
                  />
                  <Button
                    variant="outline"
                    onClick={() => document.getElementById("knowledge-file-upload")?.click()}
                    disabled={isUploadingFile}
                    data-testid="button-upload-knowledge-file"
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
                        data-testid={`knowledge-file-${file.id}`}
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
                            data-testid={`button-delete-file-${file.id}`}
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

          <Card>
            <CardHeader>
              <CardTitle>{t.settings.ai.autoLearning}</CardTitle>
              <CardDescription>
                {t.settings.ai.autoLearningDesc}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground space-y-2">
                <p>
                  {t.settings.ai.autoLearningInfo1}
                </p>
                <p>
                  {t.settings.ai.autoLearningInfo2}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
