import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearch } from "wouter";
import {
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
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/i18n";

interface SettingsData {
  instagramConnected: boolean;
  instagramUsername?: string;
  instagramAccountId?: string;
}

export default function Connections() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const searchString = useSearch();
  const [isConnecting, setIsConnecting] = useState(false);
  const { t } = useLanguage();

  const { data: settings, isLoading } = useQuery<SettingsData>({
    queryKey: ["/api/settings"],
  });

  // Check for Instagram connection result from URL params
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    if (params.get("instagram_connected") === "true") {
      toast({
        title: t.settings.errors.instagramConnected,
        description: t.settings.errors.instagramConnectedDesc,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      window.history.replaceState({}, "", "/connections");
    }
    const error = params.get("instagram_error");
    if (error) {
      let errorMessage = t.settings.errors.genericError;
      if (error === "no_pages_found") {
        errorMessage = t.settings.errors.noPages;
      } else if (error === "no_instagram_business_account") {
        errorMessage = t.settings.errors.noBusinessAccount;
      } else if (error === "session_expired") {
        errorMessage = t.settings.errors.sessionExpired;
      } else if (error === "credentials_missing") {
        errorMessage = t.settings.errors.credentialsMissing;
      }
      toast({
        title: t.settings.errors.connectionError,
        description: errorMessage,
        variant: "destructive",
      });
      window.history.replaceState({}, "", "/connections");
    }
  }, [searchString, toast, queryClient, t]);

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/instagram/disconnect");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: t.settings.connection.disconnected,
        description: t.settings.connection.disconnectedDesc,
      });
    },
    onError: () => {
      toast({
        title: t.common.error,
        description: t.settings.errors.disconnectError,
        variant: "destructive",
      });
    },
  });

  const refreshProfileMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/instagram/refresh-profile");
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      if (data.updated) {
        toast({
          title: t.settings.connection.profileUpdated,
          description: t.settings.connection.profileUpdatedDesc,
        });
      } else {
        toast({
          title: t.settings.connection.profileVerified,
          description: t.settings.connection.profileVerifiedDesc,
        });
      }
    },
    onError: () => {
      toast({
        title: t.common.error,
        description: t.settings.errors.refreshError,
        variant: "destructive",
      });
    },
  });

  const syncMessagesMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/instagram/sync");
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/pending"] });

      const added = (data.synced?.messages || 0) + (data.synced?.comments || 0);

      if (added > 0) {
        toast({
          title: "Sincronização concluída",
          description: `${added} novas mensagens encontradas.`,
        });
      } else {
        toast({
          title: "Sincronização concluída",
          description: "Nenhuma mensagem nova encontrada. Mensagens existentes foram atualizadas.",
        });
      }

      if (data.errors && data.errors.length > 0) {
        toast({
          title: "Aviso",
          description: "Alguns itens não puderam ser sincronizados.",
          variant: "destructive",
        });
      }
    },
    onError: () => {
      toast({
        title: t.common.error,
        description: "Erro ao sincronizar mensagens.",
        variant: "destructive",
      });
    },
  });

  const handleConnectInstagram = async () => {
    setIsConnecting(true);
    try {
      const response = await fetch("/api/instagram/auth", {
        credentials: "include",
      });
      const data = await response.json();

      if (data.error) {
        toast({
          title: t.common.error,
          description: data.error,
          variant: "destructive",
        });
        setIsConnecting(false);
        return;
      }

      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch (error) {
      toast({
        title: t.common.error,
        description: t.settings.errors.startConnectionError,
        variant: "destructive",
      });
      setIsConnecting(false);
    }
  };

  if (isLoading || !settings) {
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
          <h1 className="text-2xl font-semibold">Conexões</h1>
          <p className="text-muted-foreground">
            Gerencie a conexão com sua conta do Instagram.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SiInstagram className="h-5 w-5" />
            {t.settings.connection.title}
          </CardTitle>
          <CardDescription>
            {t.settings.connection.description}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {settings.instagramConnected ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg border bg-green-50 dark:bg-green-900/20">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="font-medium text-green-800 dark:text-green-400">
                      {t.settings.connection.connected}
                    </p>
                    <p className="text-sm text-green-700 dark:text-green-500">
                      @{settings.instagramUsername || (settings.instagramAccountId ? `ID: ${settings.instagramAccountId}` : "your_account")}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => refreshProfileMutation.mutate()}
                    disabled={refreshProfileMutation.isPending}
                    title={t.settings.connection.refreshProfile}
                  >
                    <RefreshCw className={`h-4 w-4 ${refreshProfileMutation.isPending ? 'animate-spin' : ''}`} />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => syncMessagesMutation.mutate()}
                    disabled={syncMessagesMutation.isPending}
                    title="Sincronizar mensagens"
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${syncMessagesMutation.isPending ? 'animate-spin' : ''}`} />
                    Sincronizar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => disconnectMutation.mutate()}
                    disabled={disconnectMutation.isPending}
                  >
                    {disconnectMutation.isPending ? t.settings.connection.disconnecting : t.settings.connection.disconnect}
                  </Button>
                </div>
              </div>

              <div className="p-4 rounded-lg border bg-blue-50 dark:bg-blue-900/20">
                <p className="font-medium text-blue-800 dark:text-blue-400 mb-2">
                  {t.settings.connection.howToVerify}
                </p>
                <ol className="text-sm text-blue-700 dark:text-blue-500 space-y-1 list-decimal list-inside">
                  <li>{t.settings.connection.verifyStep1}</li>
                  <li>{t.settings.connection.verifyStep2}</li>
                  <li>{t.settings.connection.verifyStep3}</li>
                </ol>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>{t.settings.connection.notConnected}</AlertTitle>
                <AlertDescription>
                  {t.settings.connection.notConnectedDesc}
                </AlertDescription>
              </Alert>
              <Button
                onClick={handleConnectInstagram}
                disabled={isConnecting}
              >
                <SiInstagram className="h-4 w-4 mr-2" />
                {isConnecting ? t.settings.connection.connecting : t.settings.connection.connect}
              </Button>
            </div>
          )}

          <Separator />

          <div className="space-y-2">
            <Label>{t.settings.connection.documentation}</Label>
            <p className="text-sm text-muted-foreground">
              {t.settings.connection.docDescription}
            </p>
            <Button variant="ghost" className="px-0 h-auto" asChild>
              <a
                href="https://developers.facebook.com/docs/instagram-api"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t.settings.connection.viewDocs}
                <ExternalLink className="h-3 w-3 ml-1" />
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
