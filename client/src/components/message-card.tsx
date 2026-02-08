import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MessageSquare, AtSign, Eye, Image, Video, Mic, FileImage, Play, ExternalLink, Reply } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfidenceBadge } from "@/components/confidence-badge";
import { getInitials, getAvatarGradient } from "@/lib/avatar-utils";
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
            
            {/* Parent comment context (for reply comments) */}
            {message.type === "comment" && message.parentCommentText && (
              <div className="mt-2 mb-1 pl-3 border-l-2 border-muted-foreground/30" data-testid={`parent-comment-${message.id}`}>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Reply className="h-3 w-3 rotate-180" />
                  <span>Respondendo a</span>
                  {message.parentCommentUsername && (
                    <span className="font-medium">@{message.parentCommentUsername}</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground/80 line-clamp-1 mt-0.5">
                  "{message.parentCommentText}"
                </p>
              </div>
            )}
            
            {/* Media thumbnail */}
            {message.mediaUrl && (
              <div className="mt-2 flex items-start gap-2">
                {message.mediaType === 'image' || message.mediaType === 'gif' || message.mediaType === 'animated_gif' || message.mediaType === 'sticker' ? (
                  <img 
                    src={message.mediaUrl} 
                    alt="Mídia anexada" 
                    className="w-16 h-16 object-cover rounded-md border"
                    data-testid={`media-thumbnail-${message.id}`}
                    onError={(e) => {
                      // Replace broken image with a fallback icon
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      const fallback = document.createElement('div');
                      fallback.className = 'w-16 h-16 bg-muted rounded-md border flex items-center justify-center';
                      fallback.innerHTML = '<svg class="h-6 w-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>';
                      target.parentNode?.insertBefore(fallback, target);
                    }}
                  />
                ) : message.mediaType === 'video' || message.mediaType === 'reel' ? (
                  <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-md border flex flex-col items-center justify-center">
                    <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center mb-0.5">
                      <Play className="h-4 w-4 text-purple-600 fill-purple-600 ml-0.5" />
                    </div>
                    <span className="text-[10px] text-white font-medium">{message.mediaType === 'reel' ? 'Reel' : 'Vídeo'}</span>
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
