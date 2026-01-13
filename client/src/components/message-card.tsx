import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MessageSquare, AtSign, MoreVertical, Eye } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfidenceBadge } from "@/components/confidence-badge";
import type { MessageWithResponse } from "@shared/schema";

interface MessageCardProps {
  message: MessageWithResponse;
  onView: (message: MessageWithResponse) => void;
}

export function MessageCard({ message, onView }: MessageCardProps) {
  const getStatusBadge = () => {
    switch (message.status) {
      case "pending":
        return (
          <Badge variant="outline" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-0">
            Pendente
          </Badge>
        );
      case "approved":
        return (
          <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-0">
            Aprovado
          </Badge>
        );
      case "rejected":
        return (
          <Badge variant="outline" className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-0">
            Rejeitado
          </Badge>
        );
      case "auto_sent":
        return (
          <Badge variant="outline" className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-0">
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
    <Card
      className="hover-elevate cursor-pointer transition-colors"
      onClick={() => onView(message)}
      data-testid={`card-message-${message.id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Avatar className="h-10 w-10 border">
            <AvatarImage src={message.senderAvatar || undefined} />
            <AvatarFallback className="text-xs">
              {getInitials(message.senderName)}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm truncate">
                {message.senderName}
              </span>
              <span className="text-xs text-muted-foreground">
                @{message.senderUsername}
              </span>
              <Badge
                variant="secondary"
                className="h-5 px-1.5"
              >
                {message.type === "dm" ? (
                  <MessageSquare className="h-3 w-3 mr-1" />
                ) : (
                  <AtSign className="h-3 w-3 mr-1" />
                )}
                {message.type === "dm" ? "DM" : "Comentário"}
              </Badge>
            </div>
            
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
              {message.content}
            </p>
            
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {getStatusBadge()}
              {message.aiResponse && (
                <ConfidenceBadge
                  score={message.aiResponse.confidenceScore}
                  size="sm"
                />
              )}
              <span className="text-xs text-muted-foreground ml-auto">
                {formatDistanceToNow(new Date(message.createdAt), {
                  addSuffix: true,
                  locale: ptBR,
                })}
              </span>
            </div>
          </div>
          
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              onView(message);
            }}
            data-testid={`button-view-message-${message.id}`}
          >
            <Eye className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
