import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Filter, RefreshCw, MessageSquare, AtSign } from "lucide-react";
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
import { ApprovalModal } from "@/components/approval-modal";
import { EmptyState } from "@/components/empty-state";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { MessageWithResponse } from "@shared/schema";

export default function Queue() {
  const [selectedMessage, setSelectedMessage] =
    useState<MessageWithResponse | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "dm" | "comment">("all");
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
      return res.json();
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
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível regenerar a resposta.",
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
        <div className="space-y-3">
          {filteredMessages.map((message) => (
            <MessageCard
              key={message.id}
              message={message}
              onView={handleViewMessage}
            />
          ))}
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
