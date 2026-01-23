import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MessageSquare, AtSign, Eye, Image, Video, Mic, FileImage, Play, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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

  // Generate a consistent gradient color based on username
  const getAvatarGradient = (username: string) => {
    const gradients = [
      "bg-gradient-to-br from-rose-400 to-pink-600",
      "bg-gradient-to-br from-pink-400 to-fuchsia-600",
      "bg-gradient-to-br from-fuchsia-400 to-purple-600",
      "bg-gradient-to-br from-purple-400 to-violet-600",
      "bg-gradient-to-br from-violet-400 to-indigo-600",
      "bg-gradient-to-br from-indigo-400 to-blue-600",
      "bg-gradient-to-br from-blue-400 to-cyan-600",
      "bg-gradient-to-br from-cyan-400 to-teal-600",
      "bg-gradient-to-br from-teal-400 to-emerald-600",
      "bg-gradient-to-br from-emerald-400 to-green-600",
      "bg-gradient-to-br from-amber-400 to-orange-600",
      "bg-gradient-to-br from-orange-400 to-red-600",
    ];
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
      hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    return gradients[Math.abs(hash) % gradients.length];
  };

  // Get media type icon and label
  const getMediaInfo = () => {
    if (!message.mediaType) return null;
    const mediaTypes: Record<string, { icon: typeof Image; label: string }> = {
      'image': { icon: Image, label: 'Foto' },
      'video': { icon: Video, label: 'Vídeo' },
      'audio': { icon: Mic, label: 'Áudio' },
      'gif': { icon: FileImage, label: 'GIF' },
      'animated_gif': { icon: FileImage, label: 'GIF' },
      'reel': { icon: Video, label: 'Reel' },
      'story_mention': { icon: Image, label: 'Story' },
      'sticker': { icon: Image, label: 'Sticker' },
    };
    return mediaTypes[message.mediaType] || { icon: FileImage, label: 'Mídia' };
  };

  const mediaInfo = getMediaInfo();

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
            <AvatarFallback className={`text-xs text-white font-semibold ${getAvatarGradient(message.senderUsername)}`}>
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
              {message.type === "comment" && message.postPermalink ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <a
                      href={message.postPermalink}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex"
                      data-testid={`link-instagram-comment-${message.id}`}
                    >
                      <Badge
                        variant="secondary"
                        className="h-5 px-1.5 cursor-pointer"
                      >
                        <AtSign className="h-3 w-3 mr-1" />
                        Comentário
                        <ExternalLink className="h-2.5 w-2.5 ml-1 opacity-60" />
                      </Badge>
                    </a>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Abrir post no Instagram</p>
                  </TooltipContent>
                </Tooltip>
              ) : (
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
              )}
            </div>
            
            {/* Media thumbnail */}
            {message.mediaUrl && (
              <div className="mt-2 flex items-start gap-2">
                {message.mediaType === 'image' || message.mediaType === 'gif' || message.mediaType === 'animated_gif' || message.mediaType === 'sticker' ? (
                  <img 
                    src={message.mediaUrl} 
                    alt="Mídia anexada" 
                    className="w-16 h-16 object-cover rounded-md border"
                    data-testid={`media-thumbnail-${message.id}`}
                  />
                ) : message.mediaType === 'video' || message.mediaType === 'reel' ? (
                  <div className="relative w-16 h-16 rounded-md border overflow-hidden">
                    <img 
                      src={message.mediaUrl} 
                      alt="Thumbnail do vídeo" 
                      className="w-full h-full object-cover"
                      data-testid={`video-thumbnail-${message.id}`}
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <div className="w-6 h-6 rounded-full bg-white/90 flex items-center justify-center">
                        <Play className="h-3 w-3 text-black fill-black ml-0.5" />
                      </div>
                    </div>
                  </div>
                ) : message.mediaType === 'audio' ? (
                  <div className="w-16 h-16 bg-muted rounded-md border flex items-center justify-center">
                    <Mic className="h-6 w-6 text-muted-foreground" />
                  </div>
                ) : (
                  <div className="w-16 h-16 bg-muted rounded-md border flex items-center justify-center">
                    <FileImage className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                {message.content ? (
                  <p className="text-sm text-muted-foreground flex-1 line-clamp-2">
                    {message.content}
                  </p>
                ) : mediaInfo && (
                  <p className="text-sm text-muted-foreground flex-1 italic">
                    {mediaInfo.label} recebido
                  </p>
                )}
              </div>
            )}
            
            {/* Text only (no media) */}
            {!message.mediaUrl && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                {message.content || (mediaInfo && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <mediaInfo.icon className="h-3 w-3" />
                    {mediaInfo.label} recebido
                  </span>
                ))}
              </p>
            )}
            
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
