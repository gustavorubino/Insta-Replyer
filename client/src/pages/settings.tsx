import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Settings as SettingsIcon,
  Link as LinkIcon,
  Bot,
  Brain,
  Save,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  ExternalLink,
} from "lucide-react";
import { SiInstagram } from "react-icons/si";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface SettingsData {
  instagramConnected: boolean;
  instagramUsername?: string;
  operationMode: "manual" | "semi_auto";
  confidenceThreshold: number;
  systemPrompt: string;
  autoReplyEnabled: boolean;
}

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery<SettingsData>({
    queryKey: ["/api/settings"],
  });

  const [localSettings, setLocalSettings] = useState<SettingsData | null>(null);

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
      toast({
        title: "Configurações salvas",
        description: "Suas alterações foram aplicadas com sucesso.",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível salvar as configurações.",
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
          <h1 className="text-2xl font-semibold">Configurações</h1>
          <p className="text-muted-foreground">
            Configure seu sistema de respostas automáticas
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={!hasChanges || saveMutation.isPending}
          data-testid="button-save-settings"
        >
          <Save className="h-4 w-4 mr-2" />
          {saveMutation.isPending ? "Salvando..." : "Salvar Alterações"}
        </Button>
      </div>

      <Tabs defaultValue="connection" className="space-y-6">
        <TabsList>
          <TabsTrigger value="connection" data-testid="tab-connection">
            <LinkIcon className="h-4 w-4 mr-2" />
            Conexão
          </TabsTrigger>
          <TabsTrigger value="mode" data-testid="tab-mode">
            <Bot className="h-4 w-4 mr-2" />
            Modo de Operação
          </TabsTrigger>
          <TabsTrigger value="ai" data-testid="tab-ai">
            <Brain className="h-4 w-4 mr-2" />
            Configurações da IA
          </TabsTrigger>
        </TabsList>

        <TabsContent value="connection" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SiInstagram className="h-5 w-5" />
                Conexão com Instagram
              </CardTitle>
              <CardDescription>
                Conecte sua conta Instagram Business para começar a receber
                mensagens e comentários.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {localSettings.instagramConnected ? (
                <div className="flex items-center justify-between p-4 rounded-lg border bg-green-50 dark:bg-green-900/20">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="font-medium text-green-800 dark:text-green-400">
                        Conta conectada
                      </p>
                      <p className="text-sm text-green-700 dark:text-green-500">
                        @{localSettings.instagramUsername || "sua_conta"}
                      </p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" data-testid="button-disconnect-instagram">
                    Desconectar
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Conta não conectada</AlertTitle>
                    <AlertDescription>
                      Para usar o sistema de respostas automáticas, você precisa
                      conectar sua conta Instagram Business.
                    </AlertDescription>
                  </Alert>
                  <Button data-testid="button-connect-instagram">
                    <SiInstagram className="h-4 w-4 mr-2" />
                    Conectar Instagram
                  </Button>
                </div>
              )}

              <Separator />

              <div className="space-y-2">
                <Label>Documentação</Label>
                <p className="text-sm text-muted-foreground">
                  Você precisará de uma conta Instagram Business conectada a uma
                  página do Facebook para usar a API.
                </p>
                <Button variant="link" className="px-0 h-auto" asChild>
                  <a
                    href="https://developers.facebook.com/docs/instagram-api"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Ver documentação da API do Instagram
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mode" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Modo de Operação</CardTitle>
              <CardDescription>
                Escolha como o sistema deve processar as respostas.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div
                  className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                    localSettings.operationMode === "manual"
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/50"
                  }`}
                  onClick={() =>
                    setLocalSettings({ ...localSettings, operationMode: "manual" })
                  }
                  data-testid="option-manual-mode"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`h-4 w-4 rounded-full border-2 mt-0.5 ${
                        localSettings.operationMode === "manual"
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
                      <h4 className="font-medium">Modo Manual (100% Aprovação)</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        Todas as respostas precisam de aprovação humana antes de
                        serem enviadas. Ideal para treinamento inicial da IA.
                      </p>
                    </div>
                  </div>
                </div>

                <div
                  className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                    localSettings.operationMode === "semi_auto"
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/50"
                  }`}
                  onClick={() =>
                    setLocalSettings({
                      ...localSettings,
                      operationMode: "semi_auto",
                    })
                  }
                  data-testid="option-semi-auto-mode"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`h-4 w-4 rounded-full border-2 mt-0.5 ${
                        localSettings.operationMode === "semi_auto"
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
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">Modo Semi-Automático (90% Auto)</h4>
                        <Badge variant="secondary" className="text-xs">
                          Recomendado
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        A IA envia automaticamente respostas com alta confiança.
                        Respostas com baixa confiança são enviadas para aprovação.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {localSettings.operationMode === "semi_auto" && (
                <div className="space-y-4 pt-4 border-t">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label>Limiar de Confiança</Label>
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
                      data-testid="slider-confidence-threshold"
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      Respostas com confiança acima de{" "}
                      {localSettings.confidenceThreshold}% serão enviadas
                      automaticamente.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Prompt do Sistema</CardTitle>
              <CardDescription>
                Defina instruções personalizadas para a IA seguir ao gerar
                respostas.
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
                placeholder="Ex: Você é um assistente amigável que responde em nome da loja XYZ. Seja sempre educado e profissional. Ofereça ajuda com dúvidas sobre produtos..."
                className="min-h-[150px]"
                data-testid="textarea-system-prompt"
              />
              <p className="text-xs text-muted-foreground">
                Este prompt será usado como contexto para todas as respostas
                geradas. Seja específico sobre o tom, estilo e informações que a
                IA deve incluir.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Aprendizado</CardTitle>
              <CardDescription>
                Configure como a IA aprende com suas correções.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Aprendizado Ativo</Label>
                  <p className="text-sm text-muted-foreground">
                    A IA aprenderá com as correções que você fizer nas respostas.
                  </p>
                </div>
                <Switch
                  checked={localSettings.autoReplyEnabled}
                  onCheckedChange={(checked) =>
                    setLocalSettings({
                      ...localSettings,
                      autoReplyEnabled: checked,
                    })
                  }
                  data-testid="switch-learning-enabled"
                />
              </div>
              <Separator />
              <div className="text-sm text-muted-foreground">
                <p>
                  Quando você edita uma resposta sugerida pela IA, o sistema
                  armazena a correção para melhorar futuras sugestões.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
