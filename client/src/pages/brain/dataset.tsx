import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Trash2,
  Pencil,
  Loader2,
  Search,
  Sparkles,
  Trophy,
  Image,
  MessageSquare,
  RefreshCw,
  Video,
  FileText,
  Clock,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Star,
  Eye,
} from "lucide-react";
import {
  Card,
  CardContent,
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
} from "@/components/ui/dialog";
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
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface KnowledgeStats {
  manualQA: { count: number; limit: number };
  mediaLibrary: { count: number; limit: number };
  interactionDialect: { count: number; limit: number };
}

interface ManualQAEntry {
  id: number;
  question: string;
  answer: string;
  source: string;
  createdAt: string;
}

interface MediaLibraryEntry {
  id: number;
  instagramMediaId: string;
  caption: string | null;
  mediaType: string;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  videoTranscription: string | null;
  imageDescription: string | null;
  postedAt: string | null;
  syncedAt: string;
}

interface InteractionEntry {
  id: number;
  mediaId: number | null;
  channelType: string;
  senderName: string | null;
  senderUsername: string | null;
  userMessage: string;
  myResponse: string | null;
  postContext: string | null;
  parentCommentId: string | null;
  instagramCommentId: string | null;
  isOwnerReply: boolean;
  interactedAt: string;
}

export default function Dataset() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("golden");
  const [isManualQADialogOpen, setIsManualQADialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [manualQAToDelete, setManualQAToDelete] = useState<number | null>(null);
  const [isMediaDialogOpen, setIsMediaDialogOpen] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<MediaLibraryEntry | null>(null);
  const [editingManualQA, setEditingManualQA] = useState<ManualQAEntry | null>(null);
  const [manualQAForm, setManualQAForm] = useState({ question: "", answer: "" });
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [isSyncing, setIsSyncing] = useState(false);
  const [expandedMediaId, setExpandedMediaId] = useState<number | null>(null);

  // Fetch knowledge stats
  const { data: stats } = useQuery<KnowledgeStats>({
    queryKey: ["/api/brain/knowledge/stats"],
    refetchInterval: isSyncing ? 2000 : false,
  });

  // Fetch Manual Q&A (Golden Corrections)
  const { data: manualQA = [], isLoading: loadingManualQA } = useQuery<ManualQAEntry[]>({
    queryKey: ["/api/brain/manual-qa"],
  });

  // Fetch Media Library
  const { data: mediaLibrary = [], isLoading: loadingMedia } = useQuery<MediaLibraryEntry[]>({
    queryKey: ["/api/brain/media-library"],
  });

  // Fetch interactions for expanded media
  const { data: mediaInteractions = [], isLoading: loadingInteractions } = useQuery<InteractionEntry[]>({
    queryKey: ["/api/brain/interactions", expandedMediaId],
    queryFn: async () => {
      if (!expandedMediaId) return [];
      const response = await fetch(`/api/brain/interactions/${expandedMediaId}`, {
        credentials: "include",
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!expandedMediaId,
  });

  // Sync Status Polling
  const { data: syncStatus } = useQuery({
    queryKey: ["/api/instagram/sync-status"],
    queryFn: async () => {
      const res = await fetch("/api/instagram/sync-status", { credentials: "include" });
      if (!res.ok) return { progress: 0 };
      return res.json();
    },
    // Only poll when syncing OR when progress is > 0 and < 100
    refetchInterval: (query) => {
      const progress = query.state.data?.progress || 0;
      return (isSyncing || (progress > 0 && progress < 100)) ? 1000 : false;
    },
    enabled: true
  });

  const syncProgress = syncStatus?.progress || 0;

  // Sync Knowledge mutation
  const syncMutation = useMutation({
    mutationFn: async () => {
      setIsSyncing(true);
      const response = await apiRequest("POST", "/api/brain/sync-knowledge", {});
      return response.json();
    },
    onSuccess: (data) => {
      setIsSyncing(false);
      queryClient.invalidateQueries({ queryKey: ["/api/brain/knowledge/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/brain/media-library"] });
      queryClient.invalidateQueries({ queryKey: ["/api/instagram/sync-status"] }); // Force update status to clear or show 100
      toast({
        title: "✅ Sincronização Concluída",
        description: data.message || `${data.mediaCount} posts sincronizados!`,
      });
    },
    onError: (error: any) => {
      setIsSyncing(false);
      let message = "Erro ao sincronizar conhecimento.";
      try {
        const errorData = JSON.parse(error.message.substring(error.message.indexOf("{")));
        message = errorData.code === "NOT_CONNECTED"
          ? "Conecte sua conta Instagram primeiro na aba Conexão."
          : errorData.error || message;
      } catch { }
      toast({ title: "Erro", description: message, variant: "destructive" });
    },
  });

  // Synthesize Identity mutation
  const synthesizeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/brain/synthesize-identity", {});
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: "🎭 Personalidade Sintetizada",
        description: data.message || "System prompt gerado com sucesso!",
      });
    },
    onError: (error: any) => {
      let message = "Erro ao sintetizar personalidade.";
      try {
        const errorData = JSON.parse(error.message.substring(error.message.indexOf("{")));
        message = errorData.code === "INSUFFICIENT_DATA"
          ? "Sincronize mais conteúdo antes de gerar a personalidade."
          : errorData.error || message;
      } catch { }
      toast({ title: "Erro", description: message, variant: "destructive" });
    },
  });

  // Manual QA mutations
  const updateManualQAMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { question: string; answer: string } }) => {
      const response = await apiRequest("PATCH", `/api/brain/manual-qa/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brain/manual-qa"] });
      queryClient.invalidateQueries({ queryKey: ["/api/brain/knowledge/stats"] });
      setIsManualQADialogOpen(false);
      setEditingManualQA(null);
      toast({ title: "✅ Correção Atualizada" });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao atualizar correção.", variant: "destructive" });
    },
  });

  const deleteManualQAMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/brain/manual-qa/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brain/manual-qa"] });
      queryClient.invalidateQueries({ queryKey: ["/api/brain/knowledge/stats"] });
      setIsDeleteDialogOpen(false);
      setManualQAToDelete(null);
      toast({ title: "Correção Removida" });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao remover correção.", variant: "destructive" });
    },
  });

  // Promote to Gold mutation
  const promoteToGoldMutation = useMutation({
    mutationFn: async (interactionId: number) => {
      const response = await apiRequest("POST", "/api/brain/promote-to-gold", { interactionId });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/brain/manual-qa"] });
      queryClient.invalidateQueries({ queryKey: ["/api/brain/knowledge/stats"] });
      toast({ title: "⭐ Promovido!", description: data.message });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao promover interação.", variant: "destructive" });
    },
  });

  const handleSaveManualQA = () => {
    if (!manualQAForm.question.trim() || !manualQAForm.answer.trim()) return;
    if (editingManualQA) {
      updateManualQAMutation.mutate({ id: editingManualQA.id, data: manualQAForm });
    }
  };

  const openEditManualQA = (item: ManualQAEntry) => {
    setEditingManualQA(item);
    setManualQAForm({ question: item.question, answer: item.answer });
    setIsManualQADialogOpen(true);
  };

  const confirmDeleteManualQA = (id: number) => {
    setManualQAToDelete(id);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (manualQAToDelete !== null) {
      deleteManualQAMutation.mutate(manualQAToDelete);
    }
  };

  const openMediaAnalysis = (media: MediaLibraryEntry) => {
    setSelectedMedia(media);
    setIsMediaDialogOpen(true);
  };

  const toggleMediaExpand = (mediaId: number) => {
    setExpandedMediaId(expandedMediaId === mediaId ? null : mediaId);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getMediaIcon = (type: string) => {
    switch (type?.toUpperCase()) {
      case "VIDEO":
        return <Video className="h-4 w-4 text-purple-500" />;
      case "IMAGE":
        return <Image className="h-4 w-4 text-blue-500" />;
      default:
        return <FileText className="h-4 w-4 text-gray-500" />;
    }
  };


  const sortData = <T extends { createdAt?: string; postedAt?: string | null }>(data: T[]): T[] => {
    return [...data].sort((a, b) => {
      const dateA = new Date(a.createdAt || a.postedAt || 0).getTime();
      const dateB = new Date(b.createdAt || b.postedAt || 0).getTime();
      return sortOrder === "newest" ? dateB - dateA : dateA - dateB;
    });
  };

  const filteredManualQA = sortData(manualQA).filter(
    (item) =>
      item.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.answer.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredMedia = sortData(mediaLibrary).filter(
    (item) =>
      (item.caption?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
      (item.imageDescription?.toLowerCase() || "").includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Memória & Dataset</h1>
          <p className="text-muted-foreground">
            Gerencie as fontes de conhecimento que treinam a IA.
          </p>
        </div>
      </div>

      {/* Stats Cards - 2 abas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-amber-200">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500" />
                Correções de Ouro
              </CardTitle>
              <Badge variant="outline" className="text-xs">
                {stats?.manualQA.count || 0}/{stats?.manualQA.limit || 500}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <Progress value={((stats?.manualQA.count || 0) / (stats?.manualQA.limit || 500)) * 100} className="h-2" />
            <p className="text-xs text-muted-foreground mt-2">Correções humanas</p>
          </CardContent>
        </Card>

        <Card className="border-blue-200">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Image className="h-4 w-4 text-blue-500" />
                Biblioteca de Mídia
              </CardTitle>
              <Badge variant="outline" className="text-xs">
                {stats?.mediaLibrary.count || 0}/{stats?.mediaLibrary.limit || 50}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <Progress value={((stats?.mediaLibrary.count || 0) / (stats?.mediaLibrary.limit || 50)) * 100} className="h-2" />
            <p className="text-xs text-muted-foreground mt-2">Posts + Threads ({stats?.interactionDialect.count || 0} discussões)</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs - 2 abas */}
      <Card>
        <CardContent className="pt-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
              <TabsList>
                <TabsTrigger value="golden" className="gap-2">
                  <Trophy className="h-4 w-4" />
                  Correções de Ouro
                </TabsTrigger>
                <TabsTrigger value="media" className="gap-2">
                  <Image className="h-4 w-4" />
                  Biblioteca de Mídia
                </TabsTrigger>
              </TabsList>

              <div className="flex items-center gap-2">
                <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as typeof sortOrder)}>
                  <SelectTrigger className="w-[140px]">
                    <ArrowUpDown className="h-4 w-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Mais Recentes</SelectItem>
                    <SelectItem value="oldest">Mais Antigos</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="max-w-[200px]"
                  />
                </div>
              </div>
            </div>

            {/* Golden Corrections Tab */}
            <TabsContent value="golden">
              {loadingManualQA ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredManualQA.length === 0 ? (
                <div className="text-center p-8 text-muted-foreground">
                  <Trophy className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>Nenhuma correção registrada ainda.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[35%]">Pergunta</TableHead>
                      <TableHead className="w-[35%]">Resposta</TableHead>
                      <TableHead className="w-[8%]">Fonte</TableHead>
                      <TableHead className="w-[8%]">Data</TableHead>
                      <TableHead className="w-[14%] text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredManualQA.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="align-top font-medium text-sm">"{item.question}"</TableCell>
                        <TableCell className="align-top text-sm text-muted-foreground">"{item.answer}"</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {item.source === "promoted" ? "⭐ Promovido" : item.source === "simulator" ? "Simulador" : "Fila"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDate(item.createdAt)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="icon" onClick={() => openEditManualQA(item)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => confirmDeleteManualQA(item.id)}
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
            </TabsContent>

            {/* Media Library Tab with Threads */}
            <TabsContent value="media">
              {loadingMedia ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredMedia.length === 0 ? (
                <div className="text-center p-8 text-muted-foreground">
                  <Image className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>Nenhum post sincronizado ainda.</p>
                  <p className="text-sm">Clique em "Sincronizar Instagram"</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredMedia.map((media) => (
                    <Card key={media.id} className="overflow-hidden">
                      <div className="flex flex-col md:flex-row">
                        {/* Thumbnail */}
                        <div className="w-full md:w-48 h-32 bg-muted flex-shrink-0">
                          {media.thumbnailUrl || media.mediaUrl ? (
                            <img
                              src={media.thumbnailUrl || media.mediaUrl || ""}
                              alt="Post"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              {getMediaIcon(media.mediaType)}
                            </div>
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 p-4">
                          {/* Smart Progress Bar - Real-time feedback */}
                          {(isSyncing || syncProgress > 0) && (
                            <div className="w-full space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                              <div className="flex justify-between text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  {syncProgress < 100 && <Loader2 className="h-3 w-3 animate-spin" />}
                                  {syncProgress < 20 ? "Iniciando conexão..." :
                                    syncProgress < 40 ? "Buscando posts recentes..." :
                                      syncProgress < 80 ? "Processando comentários e threads..." :
                                        syncProgress < 100 ? "Finalizando análise de IA..." :
                                          "Concluído!"}
                                </span>
                                <span className="font-medium text-primary">{syncProgress}%</span>
                              </div>
                              <Progress value={syncProgress} className="h-2 transition-all duration-500 ease-out" />
                            </div>
                          )}
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="secondary">{media.mediaType}</Badge>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDate(media.postedAt)}
                            </span>
                          </div>

                          <p className="text-sm line-clamp-2 mb-2">
                            {media.caption || <span className="italic text-muted-foreground">Sem legenda</span>}
                          </p>

                          {/* AI Vision Indicator - Shows for IMAGE posts with description */}
                          {media.mediaType?.toUpperCase() === 'IMAGE' && media.imageDescription && (
                            <div className="flex items-start gap-2 mb-3 p-2 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                              <Eye className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <span className="text-xs font-medium text-blue-700 dark:text-blue-300">IA Viu: </span>
                                <span className="text-xs text-blue-600 dark:text-blue-400">{media.imageDescription}</span>
                              </div>
                            </div>
                          )}

                          <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => openMediaAnalysis(media)}>
                              <Eye className="h-3 w-3 mr-1" />
                              Ver Análise
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Expandable Threads Section */}
                      <Collapsible open={expandedMediaId === media.id} onOpenChange={() => toggleMediaExpand(media.id)}>
                        <CollapsibleTrigger asChild>
                          <Button
                            variant="ghost"
                            className="w-full rounded-none border-t flex items-center justify-center gap-2 h-10"
                          >
                            <MessageSquare className="h-4 w-4" />
                            💬 Ver Discussão (Threads)
                            {expandedMediaId === media.id ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="p-4 bg-muted/30 border-t space-y-3">
                            {loadingInteractions && expandedMediaId === media.id ? (
                              <div className="flex justify-center py-4">
                                <Loader2 className="h-6 w-6 animate-spin" />
                              </div>
                            ) : mediaInteractions.length === 0 && expandedMediaId === media.id ? (
                              <p className="text-center text-sm text-muted-foreground py-4">
                                Nenhuma discussão encontrada para este post.
                              </p>
                            ) : expandedMediaId === media.id ? (
                              (() => {
                                // CRITICAL: Top-level = USER comments only (not owner replies)
                                // These must have no parentCommentId AND NOT be owner's own replies
                                const topLevel = mediaInteractions.filter(
                                  (interaction) => !interaction.parentCommentId && !interaction.isOwnerReply
                                );

                                // Child replies = entries WITH parentCommentId (other users' sub-replies)
                                const replies = mediaInteractions.filter(
                                  (interaction) => interaction.parentCommentId
                                );
                                const repliesByParent = new Map<string, InteractionEntry[]>();

                                for (const reply of replies) {
                                  const key = reply.parentCommentId || "unknown";
                                  const existing = repliesByParent.get(key) || [];
                                  existing.push(reply);
                                  repliesByParent.set(key, existing);
                                }

                                return topLevel.map((interaction) => {
                                  const parentKey = interaction.instagramCommentId || `${interaction.id}`;
                                  const threadReplies = (repliesByParent.get(parentKey) || [])
                                    .filter((reply) => {
                                      // Filter out duplicate owner replies that are already shown in myResponse
                                      if (!reply.isOwnerReply || !interaction.myResponse) return true;
                                      return reply.userMessage.trim() !== interaction.myResponse.trim();
                                    })
                                    .sort((a, b) => a.interactedAt.localeCompare(b.interactedAt));

                                  // Helper to display username properly
                                  const formatUsername = (username: string | null, isOwner: boolean = false) => {
                                    if (isOwner) return "@você";
                                    if (!username || username === "Anônimo" || username === "Seguidor") {
                                      return "Anônimo";
                                    }
                                    return `@${username}`;
                                  };

                                  return (
                                    <div key={interaction.id} className="bg-background/80 backdrop-blur-sm rounded-xl p-4 space-y-3 border border-border/50 shadow-sm hover:shadow-md transition-all duration-300 animate-slide-up">
                                      {/* USER COMMENT - Always first */}
                                      <div className="flex items-start gap-4">
                                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-base font-bold flex-shrink-0 shadow-sm ring-2 ring-white dark:ring-gray-800">
                                          {(interaction.senderUsername || "A").charAt(0).toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2">
                                            <span className="font-semibold text-sm text-foreground/90">
                                              {formatUsername(interaction.senderUsername)}
                                            </span>
                                            <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
                                              {new Date(interaction.interactedAt).toLocaleDateString("pt-BR", {
                                                day: "2-digit",
                                                month: "short"
                                              })}
                                            </span>
                                          </div>
                                          <p className="text-sm mt-2 text-foreground/80 leading-relaxed">{interaction.userMessage}</p>
                                        </div>
                                      </div>

                                      {/* OWNER REPLY - Nested below with connection line */}
                                      {interaction.myResponse && (
                                        <div className="relative mt-2 ml-5">
                                          {/* Connection line design */}
                                          <div className="absolute -left-5 top-0 bottom-0 w-px bg-gradient-to-b from-border to-transparent"></div>
                                          <div className="absolute -left-5 top-[18px] w-4 h-px bg-border"></div>

                                          <div className="flex items-start gap-3">
                                            <div className="h-9 w-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold flex-shrink-0 shadow-lg z-10">
                                              R
                                            </div>
                                            <div className="flex-1 bg-gradient-to-r from-primary/5 to-transparent rounded-r-xl rounded-bl-xl p-4 border border-primary/10">
                                              <div className="flex items-center justify-between gap-2 mb-2">
                                                <span className="font-bold text-sm gradient-text">
                                                  @você (Resposta)
                                                </span>
                                                <Button
                                                  variant="ghost"
                                                  size="sm"
                                                  onClick={() => promoteToGoldMutation.mutate(interaction.id)}
                                                  disabled={promoteToGoldMutation.isPending}
                                                  className="text-amber-600 hover:text-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/30 h-7 px-3 rounded-full text-xs font-medium transition-colors"
                                                >
                                                  <Star className="h-3 w-3 mr-1.5 fill-current" />
                                                  Promover a Ouro
                                                </Button>
                                              </div>
                                              <p className="text-sm italic text-foreground/90 border-l-2 border-primary/30 pl-3 py-1">
                                                "{interaction.myResponse}"
                                              </p>
                                            </div>
                                          </div>
                                        </div>
                                      )}

                                      {/* No response indicator */}
                                      {!interaction.myResponse && (
                                        <div className="ml-12 flex items-center gap-2 text-muted-foreground">
                                          <span className="text-xs">└</span>
                                          <span className="text-xs italic">⏳ Sem resposta registrada</span>
                                        </div>
                                      )}

                                      {/* Additional thread replies */}
                                      {threadReplies.length > 0 && (
                                        <div className="ml-5 space-y-2 border-l-2 border-muted pl-3">
                                          {threadReplies.map((reply) => (
                                            <div key={reply.id} className="flex items-start gap-2">
                                              <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${reply.isOwnerReply
                                                ? "bg-primary/20 text-primary"
                                                : "bg-muted text-muted-foreground"
                                                }`}>
                                                {(reply.senderUsername || "A").charAt(0).toUpperCase()}
                                              </div>
                                              <div className={`flex-1 rounded-lg p-2 ${reply.isOwnerReply
                                                ? "bg-primary/5 border-l-2 border-primary"
                                                : "bg-muted/30"
                                                }`}>
                                                <span className={`text-xs font-medium ${reply.isOwnerReply ? "text-primary" : ""}`}>
                                                  {formatUsername(reply.senderUsername, reply.isOwnerReply)}
                                                </span>
                                                <p className="text-sm mt-0.5">{reply.userMessage}</p>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                });
                              })()
                            ) : null}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card >

      {/* Manual QA Edit Dialog */}
      <Dialog open={isManualQADialogOpen} onOpenChange={setIsManualQADialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Editar Correção de Ouro</DialogTitle>
            <DialogDescription>Atualize a pergunta e/ou resposta da correção.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Pergunta *</Label>
              <Textarea
                placeholder="Ex: Como funciona o sistema?"
                value={manualQAForm.question}
                onChange={(e) => setManualQAForm({ ...manualQAForm, question: e.target.value })}
                className="min-h-[80px]"
              />
            </div>
            <div className="space-y-2">
              <Label>Resposta *</Label>
              <Textarea
                placeholder="Ex: O sistema funciona através de..."
                value={manualQAForm.answer}
                onChange={(e) => setManualQAForm({ ...manualQAForm, answer: e.target.value })}
                className="min-h-[80px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsManualQADialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveManualQA} disabled={updateManualQAMutation.isPending}>
              {updateManualQAMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Correção de Ouro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A correção será permanentemente removida da sua base de conhecimento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Media Analysis Dialog */}
      < Dialog open={isMediaDialogOpen} onOpenChange={setIsMediaDialogOpen} >
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedMedia && getMediaIcon(selectedMedia.mediaType)}
              Análise de Mídia
            </DialogTitle>
          </DialogHeader>
          {selectedMedia && (
            <div className="space-y-4">
              {(selectedMedia.thumbnailUrl || selectedMedia.mediaUrl) && (
                <div className="aspect-video rounded-lg overflow-hidden bg-muted">
                  <img
                    src={selectedMedia.thumbnailUrl || selectedMedia.mediaUrl || ""}
                    alt="Post"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">TIPO</Label>
                  <p className="font-medium">{selectedMedia.mediaType}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">DATA</Label>
                  <p className="font-medium">{formatDate(selectedMedia.postedAt)}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">LEGENDA</Label>
                  <div className="bg-muted/50 rounded-lg p-3 mt-1 max-h-[120px] overflow-y-auto">
                    <p className="text-sm whitespace-pre-wrap">
                      {selectedMedia.caption || <span className="italic text-muted-foreground">Sem legenda</span>}
                    </p>
                  </div>
                </div>
                {selectedMedia.imageDescription && (
                  <div>
                    <Label className="text-xs text-muted-foreground">🖼️ ANÁLISE VISUAL DA IA</Label>
                    <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 mt-1 border border-blue-200 dark:border-blue-900 max-h-[120px] overflow-y-auto">
                      <p className="text-sm whitespace-pre-wrap">{selectedMedia.imageDescription}</p>
                    </div>
                  </div>
                )}
                {selectedMedia.videoTranscription && (
                  <div>
                    <Label className="text-xs text-muted-foreground">🎬 TRANSCRIÇÃO</Label>
                    <div className="bg-purple-50 dark:bg-purple-950/30 rounded-lg p-3 mt-1 border border-purple-200 max-h-[120px] overflow-y-auto">
                      <p className="text-sm whitespace-pre-wrap">{selectedMedia.videoTranscription}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog >
    </div >
  );
}
