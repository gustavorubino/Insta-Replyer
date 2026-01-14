import { useState, useEffect } from "react";
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
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ConfidenceBadge } from "@/components/confidence-badge";
import type { MessageWithResponse } from "@shared/schema";

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
  const [editedResponse, setEditedResponse] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (message?.aiResponse) {
      setEditedResponse(message.aiResponse.suggestedResponse);
      setIsEditing(false);
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
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
              {message.type === "dm" ? (
                <MessageSquare className="h-4 w-4" />
              ) : (
                <AtSign className="h-4 w-4" />
              )}
              Mensagem Original
            </h3>
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
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
            </div>
          </div>

          <div className="flex flex-col overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Resposta Sugerida
              </h3>
              {message.aiResponse && (
                <ConfidenceBadge
                  score={message.aiResponse.confidenceScore}
                  showLabel={true}
                />
              )}
            </div>
            <div className="flex-1 flex flex-col gap-2 overflow-hidden">
              <div className="flex-1 relative overflow-hidden">
                <Textarea
                  value={editedResponse}
                  onChange={(e) => setEditedResponse(e.target.value)}
                  placeholder="Resposta sugerida pela IA..."
                  className="h-full min-h-[200px] resize-none"
                  disabled={!isEditing && !isLoading}
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
