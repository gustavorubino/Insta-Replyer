import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users,
  Shield,
  ShieldOff,
  RefreshCw,
  User,
  Mail,
  Calendar,
  Key,
  Eye,
  EyeOff,
  Save,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { SiFacebook, SiInstagram } from "react-icons/si";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";

interface FacebookCredentials {
  facebookAppId: string;
  facebookAppSecret: string;
  hasCredentials: boolean;
}

interface UserData {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  isAdmin: boolean;
  createdAt?: string;
}

export default function Admin() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, isLoading: isAuthLoading } = useAuth();
  const [, navigate] = useLocation();
  
  const [showSecret, setShowSecret] = useState(false);
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");

  const { data: users, isLoading: isLoadingUsers } = useQuery<UserData[]>({
    queryKey: ["/api/auth/users"],
    enabled: !!user?.isAdmin,
  });

  const { data: credentials, isLoading: isLoadingCredentials } = useQuery<FacebookCredentials>({
    queryKey: ["/api/facebook/credentials"],
    enabled: !!user?.isAdmin,
  });

  useEffect(() => {
    if (credentials) {
      setAppId(credentials.facebookAppId || "");
    }
  }, [credentials]);

  const saveCredentialsMutation = useMutation({
    mutationFn: async (data: { facebookAppId: string; facebookAppSecret: string }) => {
      await apiRequest("POST", "/api/facebook/credentials", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/facebook/credentials"] });
      setAppSecret("");
      toast({
        title: "Credenciais salvas",
        description: "As credenciais do Facebook foram configuradas com sucesso.",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível salvar as credenciais.",
        variant: "destructive",
      });
    },
  });

  const toggleAdminMutation = useMutation({
    mutationFn: async ({ userId, isAdmin }: { userId: string; isAdmin: boolean }) => {
      await apiRequest("PATCH", `/api/auth/users/${userId}/admin`, { isAdmin });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/users"] });
      toast({
        title: variables.isAdmin ? "Usuário promovido" : "Admin removido",
        description: variables.isAdmin
          ? "O usuário agora é administrador."
          : "O usuário não é mais administrador.",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível alterar as permissões.",
        variant: "destructive",
      });
    },
  });

  if (isAuthLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user?.isAdmin) {
    navigate("/");
    return null;
  }

  if (isLoadingUsers) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const adminCount = users?.filter((u) => u.isAdmin).length || 0;
  const userCount = users?.length || 0;

  const handleSaveCredentials = () => {
    if (!appId || !appSecret) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha o App ID e o App Secret.",
        variant: "destructive",
      });
      return;
    }
    saveCredentialsMutation.mutate({ facebookAppId: appId, facebookAppSecret: appSecret });
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Administração</h1>
        <p className="text-muted-foreground">
          Gerencie usuários, permissões e integrações do sistema
        </p>
      </div>

      <Tabs defaultValue="users" className="space-y-6">
        <TabsList>
          <TabsTrigger value="users" data-testid="tab-users">
            <Users className="h-4 w-4 mr-2" />
            Usuários
          </TabsTrigger>
          <TabsTrigger value="integrations" data-testid="tab-integrations">
            <SiFacebook className="h-4 w-4 mr-2" />
            Integrações
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total de Usuários</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-users">
                  {userCount}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Administradores</CardTitle>
                <Shield className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-admin-count">
                  {adminCount}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Usuários Regulares</CardTitle>
                <User className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-regular-count">
                  {userCount - adminCount}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
        <CardHeader>
          <CardTitle>Usuários Cadastrados</CardTitle>
          <CardDescription>
            Lista de todos os usuários do sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuário</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Função</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users?.map((userData) => (
                <TableRow key={userData.id} data-testid={`row-user-${userData.id}`}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {userData.isAdmin ? (
                        <Shield className="h-4 w-4 text-primary" />
                      ) : (
                        <User className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="font-medium">
                        {userData.firstName
                          ? `${userData.firstName} ${userData.lastName || ""}`
                          : "Sem nome"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm" data-testid={`text-email-${userData.id}`}>
                        {userData.email}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={userData.isAdmin ? "default" : "secondary"}>
                      {userData.isAdmin ? "Admin" : "Usuário"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {userData.id !== user?.id ? (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant={userData.isAdmin ? "outline" : "default"}
                            size="sm"
                            data-testid={`button-toggle-admin-${userData.id}`}
                          >
                            {userData.isAdmin ? (
                              <>
                                <ShieldOff className="h-4 w-4 mr-2" />
                                Remover Admin
                              </>
                            ) : (
                              <>
                                <Shield className="h-4 w-4 mr-2" />
                                Tornar Admin
                              </>
                            )}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              {userData.isAdmin
                                ? "Remover privilégios de administrador?"
                                : "Promover a administrador?"}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              {userData.isAdmin
                                ? `${userData.firstName || userData.email} perderá acesso às funções administrativas.`
                                : `${userData.firstName || userData.email} terá acesso a todas as mensagens e configurações do sistema.`}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() =>
                                toggleAdminMutation.mutate({
                                  userId: userData.id,
                                  isAdmin: !userData.isAdmin,
                                })
                              }
                              data-testid="button-confirm-toggle-admin"
                            >
                              Confirmar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    ) : (
                      <Badge variant="outline">Você</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="integrations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SiFacebook className="h-5 w-5 text-blue-600" />
                Configuração do Facebook App
              </CardTitle>
              <CardDescription>
                Configure as credenciais do seu aplicativo Facebook para permitir que usuários conectem suas contas Instagram.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {credentials?.hasCredentials ? (
                <Alert className="border-green-500 bg-green-50 dark:bg-green-900/20">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertTitle className="text-green-800 dark:text-green-400">Credenciais configuradas</AlertTitle>
                  <AlertDescription className="text-green-700 dark:text-green-500">
                    O Facebook App está configurado. Os usuários já podem conectar suas contas Instagram.
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Credenciais não configuradas</AlertTitle>
                  <AlertDescription>
                    Configure as credenciais do Facebook App para permitir a conexão com Instagram.
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="appId">Facebook App ID</Label>
                  <Input
                    id="appId"
                    placeholder="Ex: 123456789012345"
                    value={appId}
                    onChange={(e) => setAppId(e.target.value)}
                    data-testid="input-facebook-app-id"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="appSecret">Facebook App Secret</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        id="appSecret"
                        type={showSecret ? "text" : "password"}
                        placeholder={credentials?.hasCredentials ? "••••••••" : "Digite o App Secret"}
                        value={appSecret}
                        onChange={(e) => setAppSecret(e.target.value)}
                        data-testid="input-facebook-app-secret"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setShowSecret(!showSecret)}
                      data-testid="button-toggle-secret-visibility"
                    >
                      {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Encontre essas informações em developers.facebook.com &gt; Seu App &gt; Configurações &gt; Básico
                  </p>
                </div>

                <Button
                  onClick={handleSaveCredentials}
                  disabled={!appId || !appSecret || saveCredentialsMutation.isPending}
                  data-testid="button-save-facebook-credentials"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {saveCredentialsMutation.isPending ? "Salvando..." : "Salvar Credenciais"}
                </Button>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Configuração necessária no Facebook Developers</Label>
                <div className="text-sm text-muted-foreground space-y-2">
                  <p>1. Acesse developers.facebook.com e crie um aplicativo do tipo "Negócios"</p>
                  <p>2. Adicione os produtos: Facebook Login e Instagram API</p>
                  <p>3. Configure a URL de callback OAuth: <code className="bg-muted px-1 py-0.5 rounded">{window.location.origin}/api/instagram/callback</code></p>
                  <p>4. Adicione as permissões necessárias: instagram_basic, instagram_manage_messages, instagram_manage_comments</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
