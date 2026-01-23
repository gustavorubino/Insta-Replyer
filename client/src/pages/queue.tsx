import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Filter, RefreshCw, MessageSquare, AtSign, LayoutGrid, List } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageCard } from "@/components/message-card";
import { PostCommentGroup } from "@/components/post-comment-group";
import { ApprovalModal } from "@/components/approval-modal";
import { EmptyState } from "@/components/empty-state";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { MessageWithResponse } from "@shared/schema";

interface PostGroup {
  postId: string;
  postCaption: string | null;
  postThumbnailUrl: string | null;
  postPermalink: string | null;
  comments: MessageWithResponse[];
}

export default function Queue() {
  const [selectedMessage, setSelectedMessage] =
    useState<MessageWithResponse | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "dm" | "comment">("all");
  const [viewMode, setViewMode] = useState<"grouped" | "list">("grouped");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: messages, isLoading, refetch, isRefetching } = useQuery<MessageWithResponse[]>({
    queryKey: ["/api/messages/pending"],
    refetchInterval: 5000, // Auto-refresh every 5 seconds
  });

  const approveMutation = useMutation({
    mutationFn: async ({
      messageId,
      response,
      wasEdited,
    }: {
      messageId: number;
      response: string;
      wasEdited: boolean;
    }) => {
      const res = await apiRequest("POST", `/api/messages/${messageId}/approve`, {
        response,
        wasEdited,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/recent"] });
      setIsModalOpen(false);
      setSelectedMessage(null);
      
      if (data.messageSent) {
        toast({
          title: "Resposta enviada",
          description: "A resposta foi enviada com sucesso para o Instagram.",
        });
      } else {
        toast({
          title: "Erro ao enviar",
          description: data.error || "Não foi possível enviar a resposta para o Instagram.",
          variant: "destructive",
        });
      }
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível aprovar a resposta.",
        variant: "destructive",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (messageId: number) => {
      await apiRequest("POST", `/api/messages/${messageId}/reject`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/recent"] });
      setIsModalOpen(false);
      setSelectedMessage(null);
      toast({
        title: "Resposta rejeitada",
        description: "A mensagem foi marcada como rejeitada.",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível rejeitar a resposta.",
        variant: "destructive",
      });
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: async (messageId: number) => {
      const res = await apiRequest("POST", `/api/messages/${messageId}/regenerate`);
      const data = await res.json();
      
      // Check if server returned error in body
      if (!res.ok) {
        throw {
          status: res.status,
          ...data,
        };
      }
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages/pending"] });
      if (selectedMessage) {
        setSelectedMessage({
          ...selectedMessage,
          aiResponse: data.aiResponse,
        });
      }
      toast({
        title: "Resposta regenerada",
        description: "Uma nova sugestão foi gerada pela IA.",
      });
    },
    onError: (error: any) => {
      let title = "Erro ao regenerar";
      let description = "Não foi possível regenerar a resposta.";
      
      // Handle specific error codes
      if (error?.errorCode === "MISSING_API_KEY") {
        title = "IA não configurada";
        description = "A chave da API OpenAI não está configurada no servidor. Contate o administrador.";
      } else if (error?.errorCode === "RATE_LIMIT") {
        title = "Limite de requisições";
        description = "Muitas requisições. Aguarde alguns segundos e tente novamente.";
      } else if (error?.errorCode === "API_ERROR") {
        title = "Erro na API de IA";
        description = error?.error || "A API de inteligência artificial retornou um erro.";
      } else if (error?.error) {
        description = error.error;
      }
      
      toast({
        title,
        description,
        variant: "destructive",
      });
    },
  });

  const handleViewMessage = (message: MessageWithResponse) => {
    setSelectedMessage(message);
    setIsModalOpen(true);
  };

  const handleApprove = (messageId: number, response: string, wasEdited: boolean) => {
    approveMutation.mutate({ messageId, response, wasEdited });
  };

  const handleReject = (messageId: number) => {
    rejectMutation.mutate(messageId);
  };

  const handleRegenerate = (messageId: number) => {
    regenerateMutation.mutate(messageId);
  };

  const filteredMessages = messages?.filter((msg) => {
    const matchesSearch =
      searchQuery === "" ||
      (msg.content || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      msg.senderName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      msg.senderUsername.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesType = typeFilter === "all" || msg.type === typeFilter;

    return matchesSearch && matchesType;
  });

  const { postGroups, dmMessages, ungroupedComments } = useMemo(() => {
    if (!filteredMessages) {
      return { postGroups: [], dmMessages: [], ungroupedComments: [] };
    }

    const dms = filteredMessages.filter((msg) => msg.type === "dm");
    const comments = filteredMessages.filter((msg) => msg.type === "comment");
    
    const groupedByPost = new Map<string, PostGroup>();
    const ungrouped: MessageWithResponse[] = [];

    comments.forEach((comment) => {
      if (comment.postId) {
        if (!groupedByPost.has(comment.postId)) {
          groupedByPost.set(comment.postId, {
            postId: comment.postId,
            postCaption: comment.postCaption || null,
            postThumbnailUrl: comment.postThumbnailUrl || null,
            postPermalink: comment.postPermalink || null,
            comments: [],
          });
        }
        const group = groupedByPost.get(comment.postId)!;
        group.comments.push(comment);
        if (!group.postCaption && comment.postCaption) {
          group.postCaption = comment.postCaption;
        }
        if (!group.postThumbnailUrl && comment.postThumbnailUrl) {
          group.postThumbnailUrl = comment.postThumbnailUrl;
        }
        if (!group.postPermalink && comment.postPermalink) {
          group.postPermalink = comment.postPermalink;
        }
      } else {
        ungrouped.push(comment);
      }
    });

    return {
      postGroups: Array.from(groupedByPost.values()),
      dmMessages: dms,
      ungroupedComments: ungrouped,
    };
  }, [filteredMessages]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Fila de Aprovação</h1>
          <p className="text-muted-foreground">
            Revise e aprove as respostas sugeridas pela IA
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => refetch()}
          disabled={isRefetching}
          data-testid="button-refresh-queue"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar mensagens..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-messages"
          />
        </div>
        <Select
          value={typeFilter}
          onValueChange={(v) => setTypeFilter(v as "all" | "dm" | "comment")}
        >
          <SelectTrigger className="w-[160px]" data-testid="select-type-filter">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="dm">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-3 w-3" />
                DMs
              </div>
            </SelectItem>
            <SelectItem value="comment">
              <div className="flex items-center gap-2">
                <AtSign className="h-3 w-3" />
                Comentários
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
        
        <div className="flex items-center border rounded-md">
          <Button
            variant={viewMode === "grouped" ? "default" : "ghost"}
            size="sm"
            onClick={() => setViewMode("grouped")}
            className="rounded-r-none"
            data-testid="button-view-grouped"
          >
            <LayoutGrid className="h-4 w-4 mr-1" />
            Agrupado
          </Button>
          <Button
            variant={viewMode === "list" ? "default" : "ghost"}
            size="sm"
            onClick={() => setViewMode("list")}
            className="rounded-l-none"
            data-testid="button-view-list"
          >
            <List className="h-4 w-4 mr-1" />
            Lista
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-start gap-3 p-4 border rounded-lg">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-full mt-2" />
                <Skeleton className="h-3 w-3/4 mt-1" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredMessages && filteredMessages.length > 0 ? (
        <div className="space-y-4">
          {viewMode === "grouped" ? (
            <>
              {/* Grouped comments by post */}
              {postGroups.length > 0 && (
                <div className="space-y-4">
                  <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <AtSign className="h-4 w-4" />
                    Comentários por publicação ({postGroups.reduce((acc, g) => acc + g.comments.length, 0)})
                  </h2>
                  {postGroups.map((group) => (
                    <PostCommentGroup
                      key={group.postId}
                      postId={group.postId}
                      postCaption={group.postCaption}
                      postThumbnailUrl={group.postThumbnailUrl}
                      postPermalink={group.postPermalink}
                      comments={group.comments}
                      onViewMessage={handleViewMessage}
                    />
                  ))}
                </div>
              )}
              
              {/* Ungrouped comments (no postId) */}
              {ungroupedComments.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-medium text-muted-foreground">
                    Comentários sem post identificado ({ungroupedComments.length})
                  </h2>
                  {ungroupedComments.map((message) => (
                    <MessageCard
                      key={message.id}
                      message={message}
                      onView={handleViewMessage}
                    />
                  ))}
                </div>
              )}
              
              {/* DMs */}
              {dmMessages.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Mensagens Diretas ({dmMessages.length})
                  </h2>
                  {dmMessages.map((message) => (
                    <MessageCard
                      key={message.id}
                      message={message}
                      onView={handleViewMessage}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            /* List view - original behavior */
            filteredMessages.map((message) => (
              <MessageCard
                key={message.id}
                message={message}
                onView={handleViewMessage}
              />
            ))
          )}
        </div>
      ) : (
        <EmptyState
          title="Nenhuma mensagem pendente"
          description="Todas as mensagens foram processadas. Novas mensagens aparecerão aqui automaticamente."
        />
      )}

      <ApprovalModal
        message={selectedMessage}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedMessage(null);
        }}
        onApprove={handleApprove}
        onReject={handleReject}
        onRegenerate={handleRegenerate}
        isLoading={
          approveMutation.isPending ||
          rejectMutation.isPending ||
          regenerateMutation.isPending
        }
      />
    </div>
  );
}
