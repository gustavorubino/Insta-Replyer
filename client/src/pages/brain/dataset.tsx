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
  User,
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
  channelType: string;
  senderName: string | null;
  senderUsername: string | null;
  userMessage: string;
  myResponse: string | null;
  postContext: string | null;
  interactedAt: string;
}

export default function Dataset() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("golden");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<ManualQAEntry | null>(null);
  const [formData, setFormData] = useState({ question: "", answer: "" });
  const [searchTerm, setSearchTerm] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);

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

  // Fetch Interaction Dialect
  const { data: interactions = [], isLoading: loadingInteractions } = useQuery<InteractionEntry[]>({
    queryKey: ["/api/brain/interaction-dialect"],
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
      queryClient.invalidateQueries({ queryKey: ["/api/brain/interaction-dialect"] });
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

  const handleSubmit = () => {
    if (!formData.question.trim() || !formData.answer.trim()) return;
    // For now, manual additions go to the legacy dataset
    // TODO: Add to manual_qa table
    toast({ title: "Em breve", description: "Adição manual será implementada em breve." });
  };

  const openCreateDialog = () => {
    setEditingEntry(null);
    setFormData({ question: "", answer: "" });
    setIsDialogOpen(true);
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

  const getChannelBadge = (channel: string) => {
    if (channel === "public_comment") {
      return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Comentário</Badge>;
    }
    return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">DM</Badge>;
  };

  const filteredManualQA = manualQA.filter(
    (item) =>
      item.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.answer.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredMedia = mediaLibrary.filter(
    (item) =>
      (item.caption?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
      (item.imageDescription?.toLowerCase() || "").includes(searchTerm.toLowerCase())
  );

  const filteredInteractions = interactions.filter(
    (item) =>
      item.userMessage.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.myResponse?.toLowerCase() || "").includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Memória & Dataset</h1>
          <p className="text-muted-foreground">
            Visualize e gerencie as 3 fontes de conhecimento que treinam a IA.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending || isSyncing}
            className="bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200 hover:border-purple-300 dark:from-purple-950/30 dark:to-pink-950/30"
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

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-amber-200 dark:border-amber-800">
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
            <Progress
              value={((stats?.manualQA.count || 0) / (stats?.manualQA.limit || 500)) * 100}
              className="h-2"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Correções humanas que definem as regras de comportamento
            </p>
          </CardContent>
        </Card>

        <Card className="border-blue-200 dark:border-blue-800">
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
            <Progress
              value={((stats?.mediaLibrary.count || 0) / (stats?.mediaLibrary.limit || 50)) * 100}
              className="h-2"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Posts recentes que definem seus assuntos e contexto
            </p>
          </CardContent>
        </Card>

        <Card className="border-green-200 dark:border-green-800">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-green-500" />
                Histórico de Interações
              </CardTitle>
              <Badge variant="outline" className="text-xs">
                {stats?.interactionDialect.count || 0}/{stats?.interactionDialect.limit || 200}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <Progress
              value={((stats?.interactionDialect.count || 0) / (stats?.interactionDialect.limit || 200)) * 100}
              className="h-2"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Conversas reais que definem seu tom de voz
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Card>
        <CardContent className="pt-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
              <TabsList>
                <TabsTrigger value="golden" className="gap-2">
                  <Trophy className="h-4 w-4" />
                  <span className="hidden sm:inline">Correções de Ouro</span>
                  <span className="sm:hidden">Ouro</span>
                </TabsTrigger>
                <TabsTrigger value="media" className="gap-2">
                  <Image className="h-4 w-4" />
                  <span className="hidden sm:inline">Biblioteca de Mídia</span>
                  <span className="sm:hidden">Mídia</span>
                </TabsTrigger>
                <TabsTrigger value="interactions" className="gap-2">
                  <MessageSquare className="h-4 w-4" />
                  <span className="hidden sm:inline">Histórico de Interações</span>
                  <span className="sm:hidden">Interações</span>
                </TabsTrigger>
              </TabsList>

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
                  <p className="text-sm">Correções feitas na Fila de Aprovação ou Simulador aparecem aqui.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40%]">Pergunta Original</TableHead>
                      <TableHead className="w-[40%]">Resposta Corrigida</TableHead>
                      <TableHead className="w-[10%]">Fonte</TableHead>
                      <TableHead className="w-[10%]">Data</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredManualQA.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="align-top font-medium text-sm">
                          "{item.question}"
                        </TableCell>
                        <TableCell className="align-top text-sm text-muted-foreground">
                          "{item.answer}"
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {item.source === "simulator" ? "Simulador" : "Fila"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDate(item.createdAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            {/* Media Library Tab */}
            <TabsContent value="media">
              {loadingMedia ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredMedia.length === 0 ? (
                <div className="text-center p-8 text-muted-foreground">
                  <Image className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>Nenhum post sincronizado ainda.</p>
                  <p className="text-sm">Clique em "Sincronizar Instagram" para importar seus posts.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredMedia.map((item) => (
                    <Card key={item.id} className="overflow-hidden">
                      <div className="aspect-video bg-muted relative">
                        {item.thumbnailUrl || item.mediaUrl ? (
                          <img
                            src={item.thumbnailUrl || item.mediaUrl || ""}
                            alt="Post"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            {getMediaIcon(item.mediaType)}
                          </div>
                        )}
                        <Badge className="absolute top-2 right-2" variant="secondary">
                          {item.mediaType}
                        </Badge>
                      </div>
                      <CardContent className="p-3">
                        <p className="text-sm line-clamp-2 mb-2">
                          {item.caption || <span className="text-muted-foreground italic">Sem legenda</span>}
                        </p>
                        {item.imageDescription && (
                          <p className="text-xs text-muted-foreground border-l-2 border-blue-300 pl-2 mb-2">
                            🔍 {item.imageDescription}
                          </p>
                        )}
                        {item.videoTranscription && (
                          <p className="text-xs text-muted-foreground border-l-2 border-purple-300 pl-2 mb-2">
                            🎬 {item.videoTranscription.substring(0, 100)}...
                          </p>
                        )}
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {formatDate(item.postedAt)}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Interactions Tab */}
            <TabsContent value="interactions">
              {loadingInteractions ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredInteractions.length === 0 ? (
                <div className="text-center p-8 text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>Nenhuma interação sincronizada ainda.</p>
                  <p className="text-sm">Clique em "Sincronizar Instagram" para importar suas conversas.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[10%]">Canal</TableHead>
                      <TableHead className="w-[15%]">Usuário</TableHead>
                      <TableHead className="w-[35%]">Mensagem</TableHead>
                      <TableHead className="w-[30%]">Resposta</TableHead>
                      <TableHead className="w-[10%]">Data</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInteractions.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          {getChannelBadge(item.channelType)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            <span className="text-sm">@{item.senderUsername || "?"}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          "{item.userMessage}"
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {item.myResponse ? `"${item.myResponse}"` : <span className="italic">Sem resposta</span>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDate(item.interactedAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Add Entry Dialog (for future use) */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              {editingEntry ? "Editar Correção" : "Nova Correção Manual"}
            </DialogTitle>
            <DialogDescription>
              Adicione uma correção que servirá como regra de ouro para a IA.
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
              <Label>Resposta Correta</Label>
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
            <Button onClick={handleSubmit}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
