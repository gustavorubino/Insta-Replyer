import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ConfidenceBadgeProps {
  score: number;
  showLabel?: boolean;
  size?: "sm" | "md";
}

export function ConfidenceBadge({
  score,
  showLabel = true,
  size = "md",
}: ConfidenceBadgeProps) {
  const percentage = Math.round(score * 100);
  
  const getConfidenceLevel = () => {
    if (percentage >= 80) return { label: "Alta", variant: "high" as const };
    if (percentage >= 50) return { label: "Média", variant: "medium" as const };
    return { label: "Baixa", variant: "low" as const };
  };

  const { label, variant } = getConfidenceLevel();

  const variantClasses = {
    high: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    low: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };

  return (
    <Badge
      variant="outline"
      className={cn(
        "border-0 font-medium",
        variantClasses[variant],
        size === "sm" ? "text-xs px-1.5 py-0" : "text-xs px-2 py-0.5"
      )}
    >
      {percentage}%{showLabel && ` - ${label}`}
    </Badge>
  );
}
