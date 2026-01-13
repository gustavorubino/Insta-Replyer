import { Bot, User, AlertCircle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ModeToggleProps {
  mode: "manual" | "semi_auto";
  onModeChange: (mode: "manual" | "semi_auto") => void;
  disabled?: boolean;
}

export function ModeToggle({ mode, onModeChange, disabled = false }: ModeToggleProps) {
  const isAutoMode = mode === "semi_auto";

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <User className={`h-4 w-4 ${!isAutoMode ? "text-primary" : "text-muted-foreground"}`} />
        <Label className={`text-sm ${!isAutoMode ? "font-medium" : "text-muted-foreground"}`}>
          Manual
        </Label>
      </div>
      
      <Tooltip>
        <TooltipTrigger asChild>
          <div>
            <Switch
              checked={isAutoMode}
              onCheckedChange={(checked) =>
                onModeChange(checked ? "semi_auto" : "manual")
              }
              disabled={disabled}
              data-testid="switch-operation-mode"
            />
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs max-w-xs">
            {isAutoMode
              ? "Modo Semi-Automático: A IA responde automaticamente quando tem alta confiança (>80%), e solicita aprovação humana quando tem dúvidas."
              : "Modo Manual: Todas as respostas requerem aprovação humana antes do envio."}
          </p>
        </TooltipContent>
      </Tooltip>
      
      <div className="flex items-center gap-2">
        <Bot className={`h-4 w-4 ${isAutoMode ? "text-primary" : "text-muted-foreground"}`} />
        <Label className={`text-sm ${isAutoMode ? "font-medium" : "text-muted-foreground"}`}>
          Semi-Auto
        </Label>
        {isAutoMode && (
          <AlertCircle className="h-3 w-3 text-amber-500" />
        )}
      </div>
    </div>
  );
}
