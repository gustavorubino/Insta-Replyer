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
  Shield,
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

interface UserGuideline {
  id: number;
  rule: string;
  priority: number;
  category: string;
  isActive: boolean;
  createdAt: string;
}

export default function Dataset() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("guidelines");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isMediaDialogOpen, setIsMediaDialogOpen] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<MediaLibraryEntry | null>(null);
  const [editingGuideline, setEditingGuideline] = useState<UserGuideline | null>(null);
  const [guidelineForm, setGuidelineForm] = useState({ rule: "", priority: 3, category: "geral" });
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [isSyncing, setIsSyncing] = useState(false);
  const [expandedMediaId, setExpandedMediaId] = useState<number | null>(null);

  // Fetch knowledge stats
  const { data: stats } = useQuery<KnowledgeStats>({
    queryKey: ["/api/brain/knowledge/stats"],
    refetchInterval: isSyncing ? 2000 : false,
  });

  // Fetch Guidelines
  const { data: guidelines = [], isLoading: loadingGuidelines } = useQuery<UserGuideline[]>({
    queryKey: ["/api/brain/guidelines"],
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

  // Guideline mutations
  const addGuidelineMutation = useMutation({
    mutationFn: async (data: { rule: string; priority: number; category: string }) => {
      const response = await apiRequest("POST", "/api/brain/guidelines", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brain/guidelines"] });
      setIsDialogOpen(false);
      setGuidelineForm({ rule: "", priority: 3, category: "geral" });
      toast({ title: "✅ Diretriz Adicionada" });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao adicionar diretriz.", variant: "destructive" });
    },
  });

  const updateGuidelineMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<UserGuideline> }) => {
      const response = await apiRequest("PATCH", `/api/brain/guidelines/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brain/guidelines"] });
      setIsDialogOpen(false);
      setEditingGuideline(null);
      toast({ title: "✅ Diretriz Atualizada" });
    },
  });

  const deleteGuidelineMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/brain/guidelines/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brain/guidelines"] });
      toast({ title: "Diretriz Removida" });
    },
  });

  const toggleGuidelineMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      await apiRequest("PATCH", `/api/brain/guidelines/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brain/guidelines"] });
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

  const handleAddGuideline = () => {
    if (!guidelineForm.rule.trim()) return;
    if (editingGuideline) {
      updateGuidelineMutation.mutate({ id: editingGuideline.id, data: guidelineForm });
    } else {
      addGuidelineMutation.mutate(guidelineForm);
    }
  };

  const openEditGuideline = (g: UserGuideline) => {
    setEditingGuideline(g);
    setGuidelineForm({ rule: g.rule, priority: g.priority, category: g.category });
    setIsDialogOpen(true);
  };

  const openCreateGuideline = () => {
    setEditingGuideline(null);
    setGuidelineForm({ rule: "", priority: 3, category: "geral" });
    setIsDialogOpen(true);
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

  const getPriorityBadge = (priority: number) => {
    const colors: Record<number, string> = {
      5: "bg-red-100 text-red-700 border-red-200",
      4: "bg-orange-100 text-orange-700 border-orange-200",
      3: "bg-yellow-100 text-yellow-700 border-yellow-200",
      2: "bg-blue-100 text-blue-700 border-blue-200",
      1: "bg-gray-100 text-gray-700 border-gray-200",
    };
    return <Badge variant="outline" className={colors[priority] || colors[1]}>P{priority}</Badge>;
  };

  const sortData = <T extends { createdAt?: string; postedAt?: string | null }>(data: T[]): T[] => {
    return [...data].sort((a, b) => {
      const dateA = new Date(a.createdAt || a.postedAt || 0).getTime();
      const dateB = new Date(b.createdAt || b.postedAt || 0).getTime();
      return sortOrder === "newest" ? dateB - dateA : dateA - dateB;
    });
  };

  const filteredGuidelines = guidelines.filter(
    (item) => item.rule.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending || isSyncing}
            className="bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200"
          >
            {syncMutation.isPending || isSyncing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Sincronizar Instagram
          </Button>
          <Button
            onClick={() => synthesizeMutation.mutate()}
            disabled={synthesizeMutation.isPending}
            className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
          >
            {synthesizeMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Gerar Personalidade
          </Button>
        </div>
      </div>

      {/* Stats Cards - 3 abas agora */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-indigo-200">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Shield className="h-4 w-4 text-indigo-500" />
                Diretrizes
              </CardTitle>
              <Badge variant="outline" className="text-xs">{guidelines.length}/50</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <Progress value={(guidelines.length / 50) * 100} className="h-2" />
            <p className="text-xs text-muted-foreground mt-2">Regras prioritárias</p>
          </CardContent>
        </Card>

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

      {/* Tabs - 3 abas agora */}
      <Card>
        <CardContent className="pt-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
              <TabsList>
                <TabsTrigger value="guidelines" className="gap-2">
                  <Shield className="h-4 w-4" />
                  Diretrizes
                </TabsTrigger>
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

            {/* Guidelines Tab */}
            <TabsContent value="guidelines">
              <div className="flex justify-end mb-4">
                <Button onClick={openCreateGuideline} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Nova Diretriz
                </Button>
              </div>

              {loadingGuidelines ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredGuidelines.length === 0 ? (
                <div className="text-center p-8 text-muted-foreground">
                  <Shield className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>Nenhuma diretriz cadastrada.</p>
                  <p className="text-sm">Ex: "Sempre defenda a pauta X"</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[5%]">Ativo</TableHead>
                      <TableHead className="w-[10%]">Prior.</TableHead>
                      <TableHead className="w-[15%]">Categoria</TableHead>
                      <TableHead className="w-[55%]">Regra</TableHead>
                      <TableHead className="w-[15%] text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredGuidelines.map((item) => (
                      <TableRow key={item.id} className={!item.isActive ? "opacity-50" : ""}>
                        <TableCell>
                          <Switch
                            checked={item.isActive}
                            onCheckedChange={(checked) =>
                              toggleGuidelineMutation.mutate({ id: item.id, isActive: checked })
                            }
                          />
                        </TableCell>
                        <TableCell>{getPriorityBadge(item.priority)}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{item.category}</Badge>
                        </TableCell>
                        <TableCell className="font-medium">{item.rule}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="icon" onClick={() => openEditGuideline(item)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteGuidelineMutation.mutate(item.id)}
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
                      <TableHead className="w-[40%]">Pergunta</TableHead>
                      <TableHead className="w-[40%]">Resposta</TableHead>
                      <TableHead className="w-[10%]">Fonte</TableHead>
                      <TableHead className="w-[10%]">Data</TableHead>
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
                                    <div key={interaction.id} className="bg-background rounded-lg p-4 space-y-3">
                                      {/* USER COMMENT - Always first */}
                                      <div className="flex items-start gap-3">
                                        <div className="h-9 w-9 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                                          {(interaction.senderUsername || "A").charAt(0).toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2">
                                            <span className="font-semibold text-sm">
                                              {formatUsername(interaction.senderUsername)}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                              {new Date(interaction.interactedAt).toLocaleDateString("pt-BR", {
                                                day: "2-digit",
                                                month: "short"
                                              })}
                                            </span>
                                          </div>
                                          <p className="text-sm mt-1">{interaction.userMessage}</p>
                                        </div>
                                      </div>

                                      {/* OWNER REPLY - Nested below with connection line */}
                                      {interaction.myResponse && (
                                        <div className="flex items-start gap-2 ml-5">
                                          {/* Connection line */}
                                          <div className="flex flex-col items-center">
                                            <div className="w-px h-2 bg-primary/40"></div>
                                            <div className="text-xs text-primary/60">└</div>
                                          </div>
                                          <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-semibold flex-shrink-0">
                                            R
                                          </div>
                                          <div className="flex-1 bg-primary/5 rounded-lg p-3 border-l-3 border-primary">
                                            <div className="flex items-center justify-between gap-2 mb-1">
                                              <span className="font-semibold text-sm text-primary">
                                                @você (Resposta)
                                              </span>
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => promoteToGoldMutation.mutate(interaction.id)}
                                                disabled={promoteToGoldMutation.isPending}
                                                className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 h-7 px-2"
                                              >
                                                <Star className="h-3 w-3 mr-1" />
                                                Promover
                                              </Button>
                                            </div>
                                            <p className="text-sm">{interaction.myResponse}</p>
                                          </div>
                                        </div>
                                      )}
                                      {/* Note: Since we only save interactions with owner replies, 
                                          every entry now has myResponse - no "sem resposta" needed */}

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
      </Card>

      {/* Guideline Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingGuideline ? "Editar Diretriz" : "Nova Diretriz"}</DialogTitle>
            <DialogDescription>Diretrizes têm prioridade máxima na IA.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Regra *</Label>
              <Textarea
                placeholder="Ex: Sempre defenda a pauta da educação pública"
                value={guidelineForm.rule}
                onChange={(e) => setGuidelineForm({ ...guidelineForm, rule: e.target.value })}
                className="min-h-[80px]"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Prioridade</Label>
                <Select
                  value={guidelineForm.priority.toString()}
                  onValueChange={(v) => setGuidelineForm({ ...guidelineForm, priority: parseInt(v) })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5 - Máxima</SelectItem>
                    <SelectItem value="4">4 - Alta</SelectItem>
                    <SelectItem value="3">3 - Média</SelectItem>
                    <SelectItem value="2">2 - Baixa</SelectItem>
                    <SelectItem value="1">1 - Mínima</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select
                  value={guidelineForm.category}
                  onValueChange={(v) => setGuidelineForm({ ...guidelineForm, category: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="geral">Geral</SelectItem>
                    <SelectItem value="politica">Política</SelectItem>
                    <SelectItem value="comportamento">Comportamento</SelectItem>
                    <SelectItem value="marca">Marca/Produto</SelectItem>
                    <SelectItem value="restricao">Restrição</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddGuideline} disabled={addGuidelineMutation.isPending || updateGuidelineMutation.isPending}>
              {(addGuidelineMutation.isPending || updateGuidelineMutation.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Media Analysis Dialog */}
      <Dialog open={isMediaDialogOpen} onOpenChange={setIsMediaDialogOpen}>
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
                    <Label className="text-xs text-muted-foreground">🔍 DESCRIÇÃO IA</Label>
                    <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 mt-1 border border-blue-200">
                      <p className="text-sm">{selectedMedia.imageDescription}</p>
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
      </Dialog>
    </div>
  );
}
