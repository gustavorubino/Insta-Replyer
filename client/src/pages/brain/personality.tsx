import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Brain,
  Save,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Bot,
  Pencil,
  X,
  Trash2,
  Check,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/i18n";

interface SettingsData {
  operationMode: "manual" | "semi_auto" | "auto";
  confidenceThreshold: number;
  systemPrompt: string;
  aiTone?: "professional" | "friendly" | "casual";
}

export default function Personality() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  const { data: settings, isLoading, isError } = useQuery<SettingsData>({
    queryKey: ["/api/settings"],
  });

  const [localSettings, setLocalSettings] = useState<SettingsData | null>(null);
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);

  useEffect(() => {
    if (settings) {
      setLocalSettings(settings);
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async (newSettings: Partial<SettingsData>) => {
      await apiRequest("PATCH", "/api/settings", newSettings);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      setIsEditingPrompt(false); // Reset to readOnly after save
      toast({
        title: t.settings.saved,
        description: t.settings.savedDesc,
      });
    },
    onError: () => {
      toast({
        title: t.common.error,
        description: t.settings.errorSaving,
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    if (localSettings) {
      saveMutation.mutate(localSettings);
    }
  };

  const hasChanges =
    localSettings && settings
      ? JSON.stringify(localSettings) !== JSON.stringify(settings)
      : false;

  if (isError) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[400px] gap-4">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <h3 className="font-semibold text-lg">{t.common.error}</h3>
        <p className="text-muted-foreground">Erro ao carregar configurações. Verifique sua conexão.</p>
        <Button onClick={() => window.location.reload()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  if (isLoading || !localSettings) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Personalidade da IA</h1>
          <p className="text-muted-foreground">
            Configure como a IA deve se comportar e responder.
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={!hasChanges || saveMutation.isPending}
        >
          <Save className="h-4 w-4 mr-2" />
          {saveMutation.isPending ? t.settings.saving : t.settings.saveChanges}
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Brain className="h-5 w-5" />
                  Prompt do Sistema
                </CardTitle>
                {!isEditingPrompt ? (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setLocalSettings({ ...localSettings, systemPrompt: "" });
                        setIsEditingPrompt(true);
                      }}
                      title="Excluir prompt"
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setIsEditingPrompt(true)}
                      title="Editar prompt"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleSave}
                      disabled={!hasChanges || saveMutation.isPending}
                      title="Salvar alterações"
                      className="text-muted-foreground hover:text-primary"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setIsEditingPrompt(false)}
                      title="Cancelar edição"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
              <CardDescription>
                {t.settings.ai.systemPromptDesc}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={localSettings.systemPrompt}
                onChange={(e) =>
                  setLocalSettings({
                    ...localSettings,
                    systemPrompt: e.target.value,
                  })
                }
                placeholder={t.settings.ai.systemPromptPlaceholder}
                className={`min-h-[300px] font-mono text-sm ${!isEditingPrompt ? "cursor-not-allowed opacity-75" : ""}`}
                readOnly={!isEditingPrompt}
                spellCheck={true}
              />
              <p className="text-xs text-muted-foreground">
                {t.settings.ai.systemPromptHelper}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                {t.settings.mode.title}
              </CardTitle>
              <CardDescription>
                {t.settings.mode.description}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                className={`p-4 rounded-lg border cursor-pointer transition-colors ${localSettings.operationMode === "manual"
                  ? "border-primary bg-primary/5"
                  : "hover:bg-muted/50"
                  }`}
                onClick={() =>
                  setLocalSettings({ ...localSettings, operationMode: "manual" })
                }
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`h-4 w-4 rounded-full border-2 mt-0.5 ${localSettings.operationMode === "manual"
                      ? "border-primary bg-primary"
                      : "border-muted-foreground"
                      }`}
                  >
                    {localSettings.operationMode === "manual" && (
                      <div className="h-full w-full flex items-center justify-center">
                        <div className="h-1.5 w-1.5 rounded-full bg-white"></div>
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium">{t.settings.mode.manual}</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t.settings.mode.manualDesc}
                    </p>
                  </div>
                </div>
              </div>

              <div
                className={`p-4 rounded-lg border cursor-pointer transition-colors ${localSettings.operationMode === "semi_auto"
                  ? "border-primary bg-primary/5"
                  : "hover:bg-muted/50"
                  }`}
                onClick={() =>
                  setLocalSettings({
                    ...localSettings,
                    operationMode: "semi_auto",
                  })
                }
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`h-4 w-4 rounded-full border-2 mt-0.5 ${localSettings.operationMode === "semi_auto"
                      ? "border-primary bg-primary"
                      : "border-muted-foreground"
                      }`}
                  >
                    {localSettings.operationMode === "semi_auto" && (
                      <div className="h-full w-full flex items-center justify-center">
                        <div className="h-1.5 w-1.5 rounded-full bg-white"></div>
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-medium">{t.settings.mode.semiAuto}</h4>
                      <Badge variant="secondary" className="text-xs">
                        {t.settings.mode.recommended}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t.settings.mode.semiAutoDesc}
                    </p>
                    {localSettings.operationMode === "semi_auto" && (
                      <div className="mt-4 pt-4 border-t" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-2">
                          <Label>{t.settings.mode.confidenceThreshold}</Label>
                          <span className="text-sm font-medium">
                            {localSettings.confidenceThreshold}%
                          </span>
                        </div>
                        <Slider
                          value={[localSettings.confidenceThreshold]}
                          onValueChange={([value]) =>
                            setLocalSettings({
                              ...localSettings,
                              confidenceThreshold: value,
                            })
                          }
                          min={50}
                          max={95}
                          step={5}
                          className="w-full"
                        />
                        <p className="text-xs text-muted-foreground mt-2">
                          {t.settings.mode.confidenceDesc.replace(/\{threshold\}/g, String(localSettings.confidenceThreshold))}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div
                className={`p-4 rounded-lg border cursor-pointer transition-colors ${localSettings.operationMode === "auto"
                  ? "border-primary bg-primary/5"
                  : "hover:bg-muted/50"
                  }`}
                onClick={() =>
                  setLocalSettings({
                    ...localSettings,
                    operationMode: "auto",
                  })
                }
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`h-4 w-4 rounded-full border-2 mt-0.5 ${localSettings.operationMode === "auto"
                      ? "border-primary bg-primary"
                      : "border-muted-foreground"
                      }`}
                  >
                    {localSettings.operationMode === "auto" && (
                      <div className="h-full w-full flex items-center justify-center">
                        <div className="h-1.5 w-1.5 rounded-full bg-white"></div>
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-medium">{t.settings.mode.auto}</h4>
                      <Badge variant="outline" className="text-xs border-amber-500 text-amber-600">
                        {t.settings.mode.trainedAI}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t.settings.mode.autoDesc}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
