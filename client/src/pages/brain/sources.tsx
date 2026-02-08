import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Globe,
  Plus,
  Trash2,
  Loader2,
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
import { useSyncContext } from "@/contexts/SyncContext";

export default function Sources() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [profileToDelete, setProfileToDelete] = useState<number | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Use global sync context
  const { isSyncing, syncProgress, syncStatus, startSync } = useSyncContext();

  const { data: knowledgeLinks = [], isLoading: linksLoading } = useQuery<any[]>({
    queryKey: ["/api/knowledge/links"],
    refetchInterval: (query) => {
      const data = query.state.data as any[] | undefined;
      const hasProcessing = data?.some((l: any) => l.status === "pending" || l.status === "processing");
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

  // Query settings to check if systemPrompt already exists
  const { data: settings } = useQuery<any>({
    queryKey: ["/api/settings"],
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


  // Generate personality from synced content
  const generatePersonalityMutation = useMutation({
    mutationFn: async () => {
      // Create a timeout promise (60 seconds)
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Tempo limite excedido. A operação está demorando muito.")), 60000);
      });

      // Race between API call and timeout
      const apiPromise = apiRequest("POST", "/api/knowledge/generate-personality", {});
      
      return await Promise.race([apiPromise, timeoutPromise]);
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: "🎭 Personalidade Gerada",
        description: data.message || "Sua personalidade foi clonada com sucesso!",
      });
    },
    onError: (error: any) => {
      const errorMessage = error?.message || "";
      let message = "Erro ao gerar personalidade.";
      
      if (errorMessage.includes("Tempo limite")) {
        message = "A operação excedeu o tempo limite. Tente novamente ou entre em contato com o suporte.";
      } else {
        try {
          const errorData = errorMessage.includes("{") 
            ? JSON.parse(errorMessage.substring(errorMessage.indexOf("{"))) 
            : {};
          message = errorData.code === "INSUFFICIENT_DATA"
            ? "Sincronize mais conteúdo antes de gerar a personalidade."
            : errorData.error || message;
        } catch {
          // Keep default message if parsing fails
        }
      }
      
      toast({ title: "Erro", description: message, variant: "destructive" });
    },
  });

  // Handle generate personality click with confirmation
  const handleGeneratePersonality = () => {
    // Check if user already has a system prompt
    if (settings?.systemPrompt && settings.systemPrompt.length > 0) {
      // Show confirmation dialog
      setShowConfirmDialog(true);
    } else {
      // No existing prompt, proceed directly
      generatePersonalityMutation.mutate();
    }
  };

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
                const isButtonDisabled = isSyncing || hasCompletedProfile;

                return (
                  <Button
                    onClick={startSync}
                    disabled={isButtonDisabled}
                    className={
                      hasCompletedProfile
                        ? "flex-1 bg-green-600 disabled:bg-green-600 opacity-75 cursor-not-allowed"
                        : "flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                    }
                  >
                    {isSyncing ? (
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
                onClick={handleGeneratePersonality}
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
                    {syncStatus || "Sincronizando Instagram..."}
                  </span>
                  <span className="font-medium text-purple-600 dark:text-purple-400">
                    {syncProgress}%
                  </span>
                </div>
                <Progress
                  value={syncProgress}
                  className="h-2 bg-purple-100 dark:bg-purple-950 transition-all duration-300"
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
                {/* Data Quality Indicator */}
                {(() => {
                  const completedProfile = instagramProfiles.find((p: any) => p.status === "completed");
                  if (!completedProfile) return null;
                  
                  const interactionCount = completedProfile.interactionCount || completedProfile.datasetEntriesGenerated || 0;
                  
                  if (interactionCount < 30) {
                    return (
                      <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800">
                        <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
                        <p className="text-sm text-yellow-900 dark:text-yellow-100">
                          ⚠️ Poucos dados para clonagem de personalidade. Recomendamos pelo menos 30 interações. Considere adicionar mais links de treinamento para melhorar a qualidade.
                        </p>
                      </div>
                    );
                  } else if (interactionCount < 80) {
                    return (
                      <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                        <Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                        <p className="text-sm text-blue-900 dark:text-blue-100">
                          💡 Dados moderados. A personalidade será boa, mas pode melhorar com mais links de treinamento.
                        </p>
                      </div>
                    );
                  } else {
                    return (
                      <div className="flex items-start gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                        <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                        <p className="text-sm text-green-900 dark:text-green-100">
                          ✅ Excelentes dados! A IA tem material suficiente para uma clonagem precisa.
                        </p>
                      </div>
                    );
                  }
                })()}
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

      {/* Confirmation Dialog for Generating New Personality */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              Gerar Nova Personalidade?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Você já possui uma personalidade gerada. Gerar uma nova personalidade irá <strong>substituir completamente</strong> a atual com base nos dados mais recentes sincronizados.
              <br /><br />
              O que deseja fazer?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Manter Atual</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowConfirmDialog(false);
                generatePersonalityMutation.mutate();
              }}
              className="bg-purple-600 text-white hover:bg-purple-700"
            >
              Gerar Nova Personalidade
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
