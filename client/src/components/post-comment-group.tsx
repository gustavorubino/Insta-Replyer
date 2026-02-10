import { useState, useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronDown, ChevronUp, ExternalLink, Image, MessageCircle, Reply, ArrowUpDown } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getInitials, getAvatarGradient } from "@/lib/avatar-utils";
import type { MessageWithResponse } from "@shared/schema";

interface PostCommentGroupProps {
  postId: string;
  postCaption: string | null;
  postThumbnailUrl: string | null;
  postPermalink: string | null;
  comments: MessageWithResponse[];
  onViewMessage: (message: MessageWithResponse) => void;
}

function getConfidenceBadge(score: number | undefined) {
  if (score === undefined) return null;
  if (score >= 0.8) {
    return (
      <Badge variant="default" className="bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30">
        {Math.round(score * 100)}%
      </Badge>
    );
  } else if (score >= 0.6) {
    return (
      <Badge variant="default" className="bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30">
        {Math.round(score * 100)}%
      </Badge>
    );
  } else {
    return (
      <Badge variant="default" className="bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30">
        {Math.round(score * 100)}%
      </Badge>
    );
  }
}

export function PostCommentGroup({
  postId,
  postCaption,
  postThumbnailUrl,
  postPermalink,
  comments,
  onViewMessage,
}: PostCommentGroupProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [sortOrder, setSortOrder] = useState<"relevant" | "recent" | "oldest" | "followers">("relevant");

  const sortedComments = useMemo(() => {
    return [...comments].sort((a, b) => {
      switch (sortOrder) {
        case "relevant":
          const confA = a.aiResponse?.confidenceScore ?? 0;
          const confB = b.aiResponse?.confidenceScore ?? 0;
          return confB - confA;
        case "recent":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "oldest":
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "followers":
          const followersA = a.senderFollowersCount ?? 0;
          const followersB = b.senderFollowersCount ?? 0;
          return followersB - followersA;
        default:
          return 0;
      }
    });
  }, [comments, sortOrder]);

  return (
    <Card className="overflow-hidden" data-testid={`post-group-${postId}`}>
      <CardHeader
        className="p-3 cursor-pointer hover-elevate"
        onClick={() => setIsExpanded(!isExpanded)}
        data-testid={`post-group-header-${postId}`}
      >
        <div className="flex items-start gap-3">
          {postThumbnailUrl ? (
            <div className="w-16 h-16 rounded-md overflow-hidden flex-shrink-0 border">
              <img
                src={postThumbnailUrl}
                alt="Post thumbnail"
                className="w-full h-full object-cover"
                data-testid={`post-thumbnail-${postId}`}
              />
            </div>
          ) : (
            <div className="w-16 h-16 rounded-md bg-muted flex items-center justify-center flex-shrink-0 border">
              <Image className="h-6 w-6 text-muted-foreground" />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  <MessageCircle className="h-3 w-3 mr-1" />
                  {comments.length} {comments.length === 1 ? 'comentário' : 'comentários'}
                </Badge>
                {postPermalink && (postPermalink.includes("/p/") || postPermalink.includes("/reel/") || postPermalink.includes("/tv/")) && (
                  <a
                    href={postPermalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    data-testid={`post-link-${postId}`}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <Select
                  value={sortOrder}
                  onValueChange={(v) => setSortOrder(v as any)}
                >
                  <SelectTrigger className="h-8 w-[140px] text-xs">
                    <SelectValue placeholder="Ordenar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="relevant">Mais relevantes</SelectItem>
                    <SelectItem value="recent">Mais recentes</SelectItem>
                    <SelectItem value="oldest">Mais antigos</SelectItem>
                    <SelectItem value="followers">Seguidores*</SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsExpanded(!isExpanded)}
                  data-testid={`button-toggle-post-${postId}`}
                >
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {postCaption ? (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {postCaption}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                Publicação sem legenda
              </p>
            )}
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="p-0 border-t">
          <div className="divide-y">
            {sortedComments.map((comment, index) => (
              <div
                key={comment.id}
                className="p-3 hover-elevate cursor-pointer"
                onClick={() => onViewMessage(comment)}
                data-testid={`comment-item-${comment.id}`}
              >
                <div className="flex items-start gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={comment.senderAvatar || undefined} />
                    <AvatarFallback className={`text-xs text-white font-semibold ${getAvatarGradient(comment.senderUsername)}`}>
                      {getInitials(comment.senderName)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{comment.senderName}</span>
                      <span className="text-xs text-muted-foreground">
                        @{comment.senderUsername}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(comment.createdAt), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </span>
                      {getConfidenceBadge(comment.aiResponse?.confidenceScore)}
                    </div>

                    {comment.parentCommentText && (
                      <div className="mb-1 pl-2 border-l-2 border-muted-foreground/30">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Reply className="h-3 w-3 rotate-180" />
                          {comment.parentCommentUsername && (
                            <span>@{comment.parentCommentUsername}</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground/80 line-clamp-1">
                          "{comment.parentCommentText}"
                        </p>
                      </div>
                    )}

                    <p className="text-sm line-clamp-2">
                      {comment.content || <span className="italic text-muted-foreground">Mídia</span>}
                    </p>

                    {comment.aiResponse?.suggestedResponse && (
                      <div className="mt-2 p-2 rounded bg-muted/50 border border-muted">
                        <p className="text-xs text-muted-foreground mb-1">Sugestão da IA:</p>
                        <p className="text-xs line-clamp-2">{comment.aiResponse.suggestedResponse}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
