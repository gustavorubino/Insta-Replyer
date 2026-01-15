import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Search,
  Filter,
  Calendar,
  MessageSquare,
  AtSign,
  Check,
  X,
  Bot,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmptyState } from "@/components/empty-state";
import { ConfidenceBadge } from "@/components/confidence-badge";
import type { MessageWithResponse } from "@shared/schema";

interface ConversationGroup {
  senderUsername: string;
  senderName: string;
  senderAvatar: string | null;
  messages: MessageWithResponse[];
  lastMessage: MessageWithResponse;
  messageCount: number;
}

export default function History() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedConversation, setSelectedConversation] = useState<ConversationGroup | null>(null);

  const { data: messages, isLoading } = useQuery<MessageWithResponse[]>({
    queryKey: ["/api/messages"],
  });

  const filteredMessages = useMemo(() => {
    return messages?.filter((msg) => {
      const matchesSearch =
        searchQuery === "" ||
        (msg.content?.toLowerCase() || "").includes(searchQuery.toLowerCase()) ||
        msg.senderName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        msg.senderUsername.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = statusFilter === "all" || msg.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [messages, searchQuery, statusFilter]);

  const conversations = useMemo(() => {
    if (!filteredMessages) return [];

    const grouped = new Map<string, ConversationGroup>();

    filteredMessages.forEach((msg) => {
      const key = msg.senderUsername || msg.senderId || `unknown-${msg.id}`;
      
      if (!grouped.has(key)) {
        grouped.set(key, {
          senderUsername: msg.senderUsername,
          senderName: msg.senderName,
          senderAvatar: msg.senderAvatar,
          messages: [],
          lastMessage: msg,
          messageCount: 0,
        });
      }

      const group = grouped.get(key)!;
      group.messages.push(msg);
      group.messageCount++;
      
      if (new Date(msg.createdAt) > new Date(group.lastMessage.createdAt)) {
        group.lastMessage = msg;
      }
    });

    const result = Array.from(grouped.values());
    result.sort((a, b) => 
      new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime()
    );
    
    result.forEach(group => {
      group.messages.sort((a, b) => 
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    });

    return result;
  }, [filteredMessages]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <Badge variant="outline" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-0">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 mr-1.5"></span>
            Pendente
          </Badge>
        );
      case "approved":
        return (
          <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-0">
            <Check className="h-3 w-3 mr-1" />
            Aprovado
          </Badge>
        );
      case "rejected":
        return (
          <Badge variant="outline" className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-0">
            <X className="h-3 w-3 mr-1" />
            Rejeitado
          </Badge>
        );
      case "auto_sent":
        return (
          <Badge variant="outline" className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-0">
            <Bot className="h-3 w-3 mr-1" />
            Auto-enviado
          </Badge>
        );
      default:
        return null;
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  if (selectedConversation) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSelectedConversation(null)}
            data-testid="button-back-to-list"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 border">
              <AvatarImage src={selectedConversation.senderAvatar || undefined} />
              <AvatarFallback>
                {getInitials(selectedConversation.senderName)}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-xl font-semibold">{selectedConversation.senderName}</h1>
              <p className="text-sm text-muted-foreground">
                @{selectedConversation.senderUsername} · {selectedConversation.messageCount} mensagens
              </p>
            </div>
          </div>
        </div>

        <ScrollArea className="h-[calc(100vh-200px)]">
          <div className="space-y-4 pr-4">
            {selectedConversation.messages.map((message) => (
              <Card key={message.id} className="overflow-hidden" data-testid={`card-message-${message.id}`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="h-5">
                        {message.type === "dm" ? (
                          <MessageSquare className="h-3 w-3 mr-1" />
                        ) : (
                          <AtSign className="h-3 w-3 mr-1" />
                        )}
                        {message.type === "dm" ? "DM" : "Comentario"}
                      </Badge>
                      {getStatusBadge(message.status)}
                      {message.aiResponse && (
                        <ConfidenceBadge
                          score={message.aiResponse.confidenceScore}
                          showLabel={false}
                          size="sm"
                        />
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(message.createdAt), "dd/MM/yyyy 'as' HH:mm", {
                        locale: ptBR,
                      })}
                    </span>
                  </div>

                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-sm font-medium text-muted-foreground mb-1">Mensagem recebida:</p>
                    <p className="text-sm whitespace-pre-wrap">{message.content || "[Midia recebida]"}</p>
                    {message.mediaUrl && (
                      <div className="mt-2">
                        {message.mediaType?.includes("image") || message.mediaType?.includes("photo") ? (
                          <img 
                            src={message.mediaUrl} 
                            alt="Midia" 
                            className="max-w-[200px] rounded-lg"
                          />
                        ) : message.mediaType?.includes("video") ? (
                          <video 
                            src={message.mediaUrl} 
                            controls 
                            className="max-w-[200px] rounded-lg"
                          />
                        ) : (
                          <Badge variant="outline">{message.mediaType}</Badge>
                        )}
                      </div>
                    )}
                  </div>

                  {message.aiResponse && (message.aiResponse.finalResponse || message.aiResponse.suggestedResponse) && (
                    <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
                      <p className="text-sm font-medium text-primary mb-1 flex items-center gap-2">
                        Resposta {message.status === "auto_sent" ? "auto-enviada" : "enviada"}:
                        {message.aiResponse.wasEdited && (
                          <Badge variant="secondary" className="text-xs">Editada</Badge>
                        )}
                      </p>
                      <p className="text-sm whitespace-pre-wrap">
                        {message.aiResponse.finalResponse || message.aiResponse.suggestedResponse}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Historico</h1>
        <p className="text-muted-foreground">
          Conversas agrupadas por usuario
        </p>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar conversas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-history"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]" data-testid="select-status-filter">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="approved">Aprovados</SelectItem>
            <SelectItem value="rejected">Rejeitados</SelectItem>
            <SelectItem value="auto_sent">Auto-enviados</SelectItem>
            <SelectItem value="pending">Pendentes</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                  <Skeleton className="h-4 w-20" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : conversations.length > 0 ? (
        <div className="space-y-2">
          {conversations.map((conversation) => (
            <Card
              key={conversation.senderUsername}
              className="cursor-pointer hover-elevate transition-colors"
              onClick={() => setSelectedConversation(conversation)}
              data-testid={`card-conversation-${conversation.senderUsername}`}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <Avatar className="h-12 w-12 border">
                    <AvatarImage src={conversation.senderAvatar || undefined} />
                    <AvatarFallback>
                      {getInitials(conversation.senderName)}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">
                        {conversation.senderName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        @{conversation.senderUsername}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground truncate mt-0.5">
                      {conversation.lastMessage.content || "[Midia]"}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(conversation.lastMessage.createdAt), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </span>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {conversation.messageCount} msg
                      </Badge>
                      {getStatusBadge(conversation.lastMessage.status)}
                    </div>
                  </div>

                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Calendar}
          title="Nenhuma conversa encontrada"
          description="O historico de conversas aparecera aqui."
        />
      )}
    </div>
  );
}
