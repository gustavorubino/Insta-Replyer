import { useState } from "react";
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
  Eye,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { ConfidenceBadge } from "@/components/confidence-badge";
import type { MessageWithResponse } from "@shared/schema";

export default function History() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedMessage, setSelectedMessage] = useState<MessageWithResponse | null>(null);

  const { data: messages, isLoading } = useQuery<MessageWithResponse[]>({
    queryKey: ["/api/messages"],
  });

  const filteredMessages = messages?.filter((msg) => {
    const matchesSearch =
      searchQuery === "" ||
      msg.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      msg.senderName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      msg.senderUsername.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === "all" || msg.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

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

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Histórico</h1>
        <p className="text-muted-foreground">
          Veja todas as mensagens processadas e suas respostas
        </p>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar no histórico..."
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
        <div className="border rounded-lg">
          <div className="p-4 space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </div>
      ) : filteredMessages && filteredMessages.length > 0 ? (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Remetente</TableHead>
                <TableHead>Mensagem</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Confiança</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMessages.map((message) => (
                <TableRow
                  key={message.id}
                  className="cursor-pointer hover-elevate"
                  onClick={() => setSelectedMessage(message)}
                  data-testid={`row-message-${message.id}`}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8 border">
                        <AvatarImage src={message.senderAvatar || undefined} />
                        <AvatarFallback className="text-xs">
                          {getInitials(message.senderName)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium text-sm truncate max-w-[120px]">
                          {message.senderName}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          @{message.senderUsername}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[200px]">
                    <p className="text-sm truncate">{message.content}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="h-5">
                      {message.type === "dm" ? (
                        <MessageSquare className="h-3 w-3 mr-1" />
                      ) : (
                        <AtSign className="h-3 w-3 mr-1" />
                      )}
                      {message.type === "dm" ? "DM" : "Comentário"}
                    </Badge>
                  </TableCell>
                  <TableCell>{getStatusBadge(message.status)}</TableCell>
                  <TableCell>
                    {message.aiResponse && (
                      <ConfidenceBadge
                        score={message.aiResponse.confidenceScore}
                        showLabel={false}
                        size="sm"
                      />
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(message.createdAt), "dd/MM/yyyy HH:mm", {
                      locale: ptBR,
                    })}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedMessage(message);
                      }}
                      data-testid={`button-view-history-${message.id}`}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState
          icon={Calendar}
          title="Nenhum registro encontrado"
          description="O histórico de mensagens processadas aparecerá aqui."
        />
      )}

      <Dialog
        open={!!selectedMessage}
        onOpenChange={(open) => !open && setSelectedMessage(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes da Mensagem</DialogTitle>
          </DialogHeader>
          {selectedMessage && (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Avatar className="h-10 w-10 border">
                  <AvatarImage src={selectedMessage.senderAvatar || undefined} />
                  <AvatarFallback>
                    {getInitials(selectedMessage.senderName)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-medium">{selectedMessage.senderName}</div>
                  <div className="text-sm text-muted-foreground">
                    @{selectedMessage.senderUsername}
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  {getStatusBadge(selectedMessage.status)}
                  {selectedMessage.aiResponse && (
                    <ConfidenceBadge
                      score={selectedMessage.aiResponse.confidenceScore}
                    />
                  )}
                </div>
              </div>

              <div className="rounded-lg border bg-muted/30 p-4">
                <h4 className="text-sm font-medium mb-2">Mensagem Original</h4>
                <p className="text-sm whitespace-pre-wrap">
                  {selectedMessage.content}
                </p>
              </div>

              {selectedMessage.aiResponse && (
                <div className="rounded-lg border bg-muted/30 p-4">
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                    Resposta Enviada
                    {selectedMessage.aiResponse.wasEdited && (
                      <Badge variant="secondary" className="text-xs">
                        Editada
                      </Badge>
                    )}
                  </h4>
                  <p className="text-sm whitespace-pre-wrap">
                    {selectedMessage.aiResponse.finalResponse ||
                      selectedMessage.aiResponse.suggestedResponse}
                  </p>
                </div>
              )}

              <div className="text-xs text-muted-foreground">
                Recebida em{" "}
                {format(
                  new Date(selectedMessage.createdAt),
                  "dd/MM/yyyy 'às' HH:mm",
                  { locale: ptBR }
                )}
                {selectedMessage.processedAt && (
                  <>
                    {" "}
                    • Processada em{" "}
                    {format(
                      new Date(selectedMessage.processedAt),
                      "dd/MM/yyyy 'às' HH:mm",
                      { locale: ptBR }
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
