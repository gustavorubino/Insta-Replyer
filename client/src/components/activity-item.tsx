import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Check,
  X,
  Send,
  Bot,
  Edit3,
  MessageSquare,
  AtSign,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarGradient } from "@/lib/avatar-utils";

type ActivityType =
  | "approved"
  | "rejected"
  | "auto_sent"
  | "edited"
  | "received";

interface ActivityItemProps {
  type: ActivityType;
  messageType: "dm" | "comment";
  senderName: string;
  senderUsername?: string;
  senderAvatar?: string | null;
  timestamp: Date;
  preview?: string;
}

export function ActivityItem({
  type,
  messageType,
  senderName,
  senderUsername,
  senderAvatar,
  timestamp,
  preview,
}: ActivityItemProps) {
  const getIcon = () => {
    switch (type) {
      case "approved":
        return <Check className="h-3.5 w-3.5 text-green-600" />;
      case "rejected":
        return <X className="h-3.5 w-3.5 text-red-600" />;
      case "auto_sent":
        return <Bot className="h-3.5 w-3.5 text-blue-600" />;
      case "edited":
        return <Edit3 className="h-3.5 w-3.5 text-amber-600" />;
      case "received":
        return messageType === "dm" ? (
          <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <AtSign className="h-3.5 w-3.5 text-muted-foreground" />
        );
    }
  };

  const getLabel = () => {
    switch (type) {
      case "approved":
        return "Resposta aprovada";
      case "rejected":
        return "Resposta rejeitada";
      case "auto_sent":
        return "Resposta automática enviada";
      case "edited":
        return "Resposta editada e enviada";
      case "received":
        return messageType === "dm" ? "Nova DM recebida" : "Novo comentário recebido";
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
    <div className="flex items-start gap-3 py-3">
      <div className="relative">
        <Avatar className="h-8 w-8 border">
          <AvatarImage src={senderAvatar || undefined} />
          <AvatarFallback className={`text-xs text-white font-semibold ${getAvatarGradient(senderUsername || senderName)}`}>
            {getInitials(senderName)}
          </AvatarFallback>
        </Avatar>
        <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-background border">
          {getIcon()}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm">
          <span className="font-medium">{senderName}</span>
          <span className="text-muted-foreground"> - {getLabel()}</span>
        </p>
        {preview && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {preview}
          </p>
        )}
        <span className="text-xs text-muted-foreground">
          {formatDistanceToNow(timestamp, { addSuffix: true, locale: ptBR })}
        </span>
      </div>
    </div>
  );
}
