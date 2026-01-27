import { useState, useEffect, useRef } from "react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Check,
  X,
  Edit3,
  Send,
  MessageSquare,
  AtSign,
  Sparkles,
  RotateCcw,
  Smile,
  AlertTriangle,
  ExternalLink,
  Reply,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ConfidenceBadge } from "@/components/confidence-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";

import type { MessageWithResponse } from "@shared/schema";

const EMOJI_LIST = [
  "😊", "😃", "😄", "😁", "😆", "😅", "🤣", "😂",
  "🙂", "😉", "😍", "🥰", "😘", "😗", "😙", "😚",
  "👍", "👎", "👏", "🙌", "🤝", "🙏", "💪", "✌️",
  "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍",
  "⭐", "🌟", "✨", "💫", "🔥", "💯", "🎉", "🎊",
  "👋", "🤗", "🤔", "🤷", "💬", "📢", "📣", "🔔",
  "✅", "❌", "⚠️", "💡", "📌", "📍", "🎯", "🚀",
];

interface ApprovalModalProps {
  message: MessageWithResponse | null;
  isOpen: boolean;
  onClose: () => void;
  onApprove: (messageId: number, response: string, wasEdited: boolean) => void;
  onReject: (messageId: number) => void;
  onRegenerate: (messageId: number) => void;
  isLoading?: boolean;
}

export function ApprovalModal({
  message,
  isOpen,
  onClose,
  onApprove,
  onReject,
  onRegenerate,
  isLoading = false,
}: ApprovalModalProps) {
  const { toast } = useToast();
  const [editedResponse, setEditedResponse] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [emojiPopoverOpen, setEmojiPopoverOpen] = useState(false);
  const [hasAIError, setHasAIError] = useState(false);

  // Feedback state
  const [feedbackStatus, setFeedbackStatus] = useState<"like" | "dislike" | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [showFeedbackInput, setShowFeedbackInput] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const feedbackMutation = useMutation({
    mutationFn: async (data: { status: "like" | "dislike"; text?: string }) => {
      if (!message) return;
      await apiRequest("POST", `/api/messages/${message.id}/feedback`, {
        feedbackStatus: data.status,
        feedbackText: data.text,
      });
    },
    onSuccess: () => {
      toast({
        title: "Feedback enviado",
        description: "Obrigado por ajudar a melhorar a IA!",
      });
      setShowFeedbackInput(false);
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível enviar o feedback.",
        variant: "destructive",
      });
    },
  });

  const handleFeedback = (status: "like" | "dislike") => {
    setFeedbackStatus(status);
    if (status === "dislike") {
      setShowFeedbackInput(true);
    } else {
      setShowFeedbackInput(false);
      feedbackMutation.mutate({ status });
    }
  };

  const submitDislikeReason = () => {
    feedbackMutation.mutate({ status: "dislike", text: feedbackText });
  };

  const insertEmoji = (emoji: string) => {
    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newText = editedResponse.substring(0, start) + emoji + editedResponse.substring(end);
      setEditedResponse(newText);
      setTimeout(() => {
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = start + emoji.length;
      }, 0);
    } else {
      setEditedResponse(editedResponse + emoji);
    }
    setEmojiPopoverOpen(false);
  };

  useEffect(() => {
    if (message?.aiResponse) {
      // Check if the response is an error placeholder
      const response = message.aiResponse.suggestedResponse || "";
      const isErrorResponse = 
        response === "" ||
        response.startsWith("Desculpe, ocorreu um erro") ||
        response.startsWith("Erro ao") ||
        (message.aiResponse.confidenceScore === 0.1 && response.includes("erro"));
      
      setHasAIError(isErrorResponse);
      setEditedResponse(isErrorResponse ? "" : response);
      setIsEditing(isErrorResponse); // Auto-enable editing if error

      // Reset feedback state
      setFeedbackStatus(null);
      setFeedbackText("");
      setShowFeedbackInput(false);
    } else {
      setHasAIError(true); // No AI response at all
      setEditedResponse("");
      setIsEditing(true);
    }
  }, [message]);

  if (!message) return null;

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

  const originalResponse = message.aiResponse?.suggestedResponse || "";
  const wasEdited = editedResponse !== originalResponse;

  const handleApprove = () => {
    onApprove(message.id, editedResponse, wasEdited);
  };

  const handleReject = () => {
    onReject(message.id);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Revisar Resposta
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 overflow-hidden">
          <div className="flex flex-col overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium flex items-center gap-2">
                {message.type === "dm" ? (
                  <MessageSquare className="h-4 w-4" />
                ) : (
                  <AtSign className="h-4 w-4" />
                )}
                {message.type === "dm" ? "Mensagem Direta" : "Comentário no Post"}
              </h3>
              {message.type === "comment" && message.postPermalink && (message.postPermalink.includes("/p/") || message.postPermalink.includes("/reel/") || message.postPermalink.includes("/tv/")) && (
                <a
                  href={message.postPermalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="link-view-post-context"
                >
                  <ExternalLink className="h-3 w-3" />
                  Ver post no Instagram
                </a>
              )}
            </div>
            <div className="flex-1 rounded-lg border bg-muted/30 p-4 overflow-auto">
              <div className="flex items-start gap-3">
                <Avatar className="h-10 w-10 border">
                  <AvatarImage src={message.senderAvatar || undefined} />
                  <AvatarFallback className={`text-xs text-white font-semibold ${getAvatarGradient(message.senderUsername)}`}>
                    {getInitials(message.senderName)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">
                      {message.senderName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      @{message.senderUsername}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(message.createdAt), {
                      addSuffix: true,
                      locale: ptBR,
                    })}
                  </span>
                </div>
              </div>
              <Separator className="my-3" />
              
              {/* Parent comment context (for reply comments) */}
              {message.type === "comment" && message.parentCommentText && (
                <div className="mb-3 p-3 rounded-lg bg-muted/50 border border-muted" data-testid="parent-comment-context">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                    <Reply className="h-3.5 w-3.5 rotate-180" />
                    <span>Em resposta ao comentário</span>
                    {message.parentCommentUsername && (
                      <>
                        <span>de</span>
                        <span className="font-semibold">@{message.parentCommentUsername}</span>
                      </>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground italic">
                    "{message.parentCommentText}"
                  </p>
                </div>
              )}
              
              {/* Media display */}
              {message.mediaUrl && (
                <div className="mb-3">
                  {message.mediaType === 'image' || message.mediaType === 'gif' || message.mediaType === 'sticker' ? (
                    <img 
                      src={message.mediaUrl} 
                      alt="Mídia anexada" 
                      className="max-w-full max-h-48 object-contain rounded-md border"
                      data-testid="media-image"
                    />
                  ) : message.mediaType === 'video' || message.mediaType === 'reel' ? (
                    <video 
                      src={message.mediaUrl} 
                      controls 
                      className="max-w-full max-h-48 rounded-md border"
                      data-testid="media-video"
                    >
                      Seu navegador não suporta vídeo.
                    </video>
                  ) : message.mediaType === 'audio' ? (
                    <audio 
                      src={message.mediaUrl} 
                      controls 
                      className="w-full"
                      data-testid="media-audio"
                    >
                      Seu navegador não suporta áudio.
                    </audio>
                  ) : (
                    <a 
                      href={message.mediaUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="underline text-sm"
                      data-testid="media-link"
                    >
                      Ver mídia anexada ({message.mediaType || 'arquivo'})
                    </a>
                  )}
                </div>
              )}
              
              {message.content && (
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              )}
              
              {!message.content && message.mediaType && (
                <p className="text-sm text-muted-foreground italic">
                  Mensagem contém apenas mídia ({message.mediaType})
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Resposta Sugerida
              </h3>
              <div className="flex items-center gap-2">
                {message.aiResponse && (
                  <ConfidenceBadge
                    score={message.aiResponse.confidenceScore}
                    showLabel={true}
                  />
                )}
                {message.aiResponse && (
                  <div className="flex items-center border rounded-md ml-2">
                    <Button
                      variant={feedbackStatus === "like" ? "default" : "ghost"}
                      size="icon"
                      className="h-6 w-6 rounded-none rounded-l-md"
                      onClick={() => handleFeedback("like")}
                      title="Gostei da sugestão"
                    >
                      <ThumbsUp className="h-3 w-3" />
                    </Button>
                    <Separator orientation="vertical" className="h-4" />
                    <Button
                      variant={feedbackStatus === "dislike" ? "default" : "ghost"}
                      size="icon"
                      className="h-6 w-6 rounded-none rounded-r-md"
                      onClick={() => handleFeedback("dislike")}
                      title="Não gostei (enviar feedback)"
                    >
                      <ThumbsDown className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {showFeedbackInput && (
              <div className="flex gap-2 animate-in slide-in-from-top-2 mb-2">
                <Input
                  placeholder="Por que não gostou? (opcional)"
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  className="h-8 text-sm"
                />
                <Button size="sm" onClick={submitDislikeReason} disabled={feedbackMutation.isPending}>
                  Enviar
                </Button>
              </div>
            )}

            <div className="flex-1 flex flex-col gap-2 overflow-hidden">
              {hasAIError && (
                <Alert variant="destructive" className="py-2">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-sm">
                    A IA não conseguiu gerar uma sugestão. Escreva uma resposta manualmente ou clique em "Regenerar" para tentar novamente.
                  </AlertDescription>
                </Alert>
              )}
              <div className="flex-1 relative overflow-hidden">
                <Textarea
                  ref={textareaRef}
                  value={editedResponse}
                  onChange={(e) => setEditedResponse(e.target.value)}
                  placeholder={hasAIError ? "Escreva sua resposta aqui..." : "Resposta sugerida pela IA..."}
                  className="h-full min-h-[200px] resize-none"
                  disabled={!isEditing && !isLoading}
                  spellCheck={true}
                  lang="pt-BR"
                  data-testid="textarea-response"
                />
                {wasEdited && (
                  <Badge
                    variant="secondary"
                    className="absolute top-2 right-2"
                  >
                    Editado
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditing(!isEditing)}
                  data-testid="button-edit-response"
                >
                  <Edit3 className="h-4 w-4 mr-1" />
                  {isEditing ? "Salvar" : "Editar"}
                </Button>
                <Popover open={emojiPopoverOpen} onOpenChange={setEmojiPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!isEditing}
                      data-testid="button-emoji"
                    >
                      <Smile className="h-4 w-4 mr-1" />
                      Emoji
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-2" align="start">
                    <div className="grid grid-cols-8 gap-1">
                      {EMOJI_LIST.map((emoji, index) => (
                        <button
                          key={index}
                          type="button"
                          className="p-1.5 text-xl hover:bg-muted rounded cursor-pointer transition-colors"
                          onClick={() => insertEmoji(emoji)}
                          data-testid={`emoji-${index}`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onRegenerate(message.id)}
                  disabled={isLoading}
                  data-testid="button-regenerate"
                >
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Regenerar
                </Button>
              </div>
            </div>
          </div>
        </div>

        <Separator />

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button
            variant="outline"
            onClick={handleReject}
            disabled={isLoading}
            data-testid="button-reject"
          >
            <X className="h-4 w-4 mr-1" />
            Rejeitar
          </Button>
          <Button
            variant="default"
            onClick={handleApprove}
            disabled={isLoading || !editedResponse.trim()}
            data-testid="button-approve"
          >
            <Check className="h-4 w-4 mr-1" />
            Aprovar e Enviar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
