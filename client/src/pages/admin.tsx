import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users,
  Shield,
  ShieldOff,
  RefreshCw,
  User,
  Mail,
  Trash2,
  Settings,
  Instagram,
  CheckCircle,
  XCircle,
  MessageSquare,
  Clock,
  AlertCircle,
  Edit,
} from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface UserData {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  isAdmin: boolean;
  createdAt?: string;
  instagramAccountId?: string;
  instagramUsername?: string;
  instagramRecipientId?: string;
}

interface UserStats {
  userId: string;
  totalMessages: number;
  pendingMessages: number;
  approvedMessages: number;
  rejectedMessages: number;
  autoSentMessages: number;
  averageConfidence: number;
  editedResponses: number;
  lastActivity: string | null;
}

export default function Admin() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, isLoading: isAuthLoading } = useAuth();
  const [, navigate] = useLocation();
  
  const [editRecipientDialog, setEditRecipientDialog] = useState<{
    open: boolean;
    user: UserData | null;
  }>({ open: false, user: null });
  const [newRecipientId, setNewRecipientId] = useState("");
  
  const { data: users, isLoading: isLoadingUsers, isError: isErrorUsers, refetch: refetchUsers } = useQuery<UserData[]>({
    queryKey: ["/api/auth/users"],
    enabled: !!user?.isAdmin,
  });

  const { data: userStats, isLoading: isLoadingStats, isError: isErrorStats, refetch: refetchStats } = useQuery<UserStats[]>({
    queryKey: ["/api/admin/user-stats"],
    enabled: !!user?.isAdmin,
  });

  const { data: webhookStatusData } = useQuery<{
    lastUnmappedWebhookRecipientId?: string | null;
    lastUnmappedWebhookTimestamp?: string | null;
  }>({
    queryKey: ["/api/admin/webhook-status"],
    enabled: !!user?.isAdmin,
    refetchInterval: 30000,
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

  const clearMessagesMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("DELETE", "/api/clear-messages");
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/user-stats"] });
      toast({
        title: "Mensagens limpas",
        description: `${data.deleted?.messages || 0} mensagens e ${data.deleted?.aiResponses || 0} respostas de IA foram removidas.`,
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível limpar as mensagens.",
        variant: "destructive",
      });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return await apiRequest("DELETE", `/api/admin/users/${userId}`);
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/user-stats"] });
      toast({
        title: "Usuário excluído",
        description: `Usuário removido com sucesso. ${data.deleted?.messages || 0} mensagens foram excluídas.`,
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível excluir o usuário.",
        variant: "destructive",
      });
    },
  });

  const updateRecipientMutation = useMutation({
    mutationFn: async ({ userId, instagramRecipientId }: { userId: string; instagramRecipientId: string }) => {
      return apiRequest("PATCH", `/api/admin/users/${userId}/instagram`, {
        instagramRecipientId
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/users"] });
      toast({
        title: "Sucesso",
        description: "ID de Webhook atualizado com sucesso",
      });
      setEditRecipientDialog({ open: false, user: null });
      setNewRecipientId("");
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const clearWebhookAlertMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", "/api/admin/webhook-status");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/webhook-status"] });
      toast({
        title: "Sucesso",
        description: "Alerta de webhook limpo com sucesso",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível limpar o alerta",
        variant: "destructive",
      });
    },
  });

  const openEditRecipientDialog = (userData: UserData) => {
    setNewRecipientId(userData.instagramRecipientId || "");
    setEditRecipientDialog({ open: true, user: userData });
  };

  const getUserStatsById = (userId: string): UserStats | undefined => {
    return userStats?.find((stat) => stat.userId === userId);
  };

  const formatLastActivity = (date: string | null | undefined): string => {
    if (!date) return "Sem atividade";
    try {
      return formatDistanceToNow(new Date(date), { addSuffix: true, locale: ptBR });
    } catch {
      return "Data inválida";
    }
  };

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

  if (isLoadingUsers || isLoadingStats) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isErrorUsers || isErrorStats) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[400px] gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <div className="text-center">
          <h2 className="text-lg font-semibold">Erro ao carregar dados</h2>
          <p className="text-muted-foreground">
            Não foi possível carregar as informações de administração.
          </p>
        </div>
        <Button 
          onClick={() => {
            refetchUsers();
            refetchStats();
          }}
          data-testid="button-retry-load"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Tentar novamente
        </Button>
      </div>
    );
  }

  const adminCount = users?.filter((u) => u.isAdmin).length || 0;
  const userCount = users?.length || 0;
  const usersWithInstagram = users?.filter((u) => u.instagramAccountId) || [];
  const connectedAccountsCount = usersWithInstagram.length;

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
          <TabsTrigger value="instagram" data-testid="tab-instagram">
            <Instagram className="h-4 w-4 mr-2" />
            Contas Instagram
          </TabsTrigger>
          <TabsTrigger value="maintenance" data-testid="tab-maintenance">
            <Settings className="h-4 w-4 mr-2" />
            Manutenção
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
                    <TableHead>Instagram</TableHead>
                    <TableHead>Mensagens</TableHead>
                    <TableHead>Última Atividade</TableHead>
                    <TableHead>Função</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users?.map((userData) => {
                    const stats = getUserStatsById(userData.id);
                    return (
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
                          {userData.instagramAccountId ? (
                            <Badge variant="default" className="gap-1" data-testid={`badge-instagram-connected-${userData.id}`}>
                              <CheckCircle className="h-3 w-3" />
                              Conectado
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="gap-1" data-testid={`badge-instagram-disconnected-${userData.id}`}>
                              <XCircle className="h-3 w-3" />
                              Não conectado
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <MessageSquare className="h-4 w-4 text-muted-foreground" />
                            <span data-testid={`text-messages-${userData.id}`}>
                              {stats?.totalMessages || 0}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground" data-testid={`text-last-activity-${userData.id}`}>
                              {formatLastActivity(stats?.lastActivity)}
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
                            <div className="flex items-center justify-end gap-2">
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
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="destructive"
                                    size="icon"
                                    data-testid={`button-delete-user-${userData.id}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>
                                      Excluir usuário?
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Esta ação irá excluir permanentemente o usuário{" "}
                                      <strong>{userData.firstName || userData.email}</strong> e todas as suas mensagens.
                                      Esta ação não pode ser desfeita.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => deleteUserMutation.mutate(userData.id)}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      data-testid="button-confirm-delete-user"
                                    >
                                      Excluir
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          ) : (
                            <Badge variant="outline">Você</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="instagram" className="space-y-4">
          {webhookStatusData?.lastUnmappedWebhookRecipientId && (
            <div className="p-4 border border-amber-500 bg-amber-50 dark:bg-amber-950/20 rounded-lg" data-testid="alert-unmapped-webhook">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-500" />
                  <span className="font-semibold text-amber-700 dark:text-amber-500">
                    Webhook não mapeado detectado
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => clearWebhookAlertMutation.mutate()}
                  disabled={clearWebhookAlertMutation.isPending}
                  data-testid="button-clear-webhook-alert"
                >
                  {clearWebhookAlertMutation.isPending ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-sm text-amber-600 dark:text-amber-400 mb-2">
                Um webhook do Instagram chegou com o ID: <code className="font-mono bg-amber-100 dark:bg-amber-900/40 px-1 rounded">{webhookStatusData.lastUnmappedWebhookRecipientId}</code>
              </p>
              <p className="text-sm text-amber-600 dark:text-amber-400">
                Configure o "ID Webhook" de um usuário abaixo com este valor para receber mensagens.
              </p>
              {webhookStatusData.lastUnmappedWebhookTimestamp && (
                <p className="text-xs text-amber-500 dark:text-amber-500/70 mt-1">
                  Detectado em: {new Date(webhookStatusData.lastUnmappedWebhookTimestamp).toLocaleString('pt-BR')}
                </p>
              )}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total de Contas Conectadas</CardTitle>
                <Instagram className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-connected-accounts">
                  {connectedAccountsCount}
                </div>
                <p className="text-xs text-muted-foreground">
                  de {userCount} usuários
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Mensagens Hoje</CardTitle>
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-messages-today">
                  0
                </div>
                <p className="text-xs text-muted-foreground">
                  Filtro de data não implementado
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Contas Instagram Conectadas</CardTitle>
              <CardDescription>
                Lista de usuários com integração do Instagram ativa
              </CardDescription>
            </CardHeader>
            <CardContent>
              {usersWithInstagram.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Instagram className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhuma conta Instagram conectada</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Usuário</TableHead>
                      <TableHead>Conta Instagram</TableHead>
                      <TableHead>ID Webhook</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Mensagens</TableHead>
                      <TableHead>Última Atividade</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usersWithInstagram.map((userData) => {
                      const stats = getUserStatsById(userData.id);
                      return (
                        <TableRow key={userData.id} data-testid={`row-instagram-${userData.id}`}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium" data-testid={`text-ig-user-${userData.id}`}>
                                {userData.firstName
                                  ? `${userData.firstName} ${userData.lastName || ""}`
                                  : userData.email}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Instagram className="h-4 w-4 text-pink-500" />
                              <span data-testid={`text-ig-username-${userData.id}`}>
                                {userData.instagramUsername || userData.instagramAccountId}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-mono" data-testid={`text-ig-recipient-${userData.id}`}>
                                {userData.instagramRecipientId || (
                                  <Badge variant="outline" className="text-amber-600 dark:text-amber-500">
                                    Não configurado
                                  </Badge>
                                )}
                              </span>
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                onClick={() => openEditRecipientDialog(userData)}
                                data-testid={`button-edit-recipient-${userData.id}`}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="default" className="gap-1" data-testid={`badge-ig-status-${userData.id}`}>
                              <CheckCircle className="h-3 w-3" />
                              Conectado
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span data-testid={`text-ig-messages-${userData.id}`}>
                              {stats?.totalMessages || 0}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground" data-testid={`text-ig-last-activity-${userData.id}`}>
                              {formatLastActivity(stats?.lastActivity)}
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="maintenance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Limpar Mensagens</CardTitle>
              <CardDescription>
                Remove todas as mensagens do Instagram e respostas de IA do banco de dados.
                Esta ação não pode ser desfeita.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    disabled={clearMessagesMutation.isPending}
                    data-testid="button-clear-messages"
                  >
                    {clearMessagesMutation.isPending ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Limpando...
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Limpar Todas as Mensagens
                      </>
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Limpar todas as mensagens?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação irá remover permanentemente todas as mensagens do Instagram
                      e suas respostas de IA do sistema. Esta ação não pode ser desfeita.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => clearMessagesMutation.mutate()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      data-testid="button-confirm-clear-messages"
                    >
                      Limpar Mensagens
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog 
        open={editRecipientDialog.open} 
        onOpenChange={(open) => {
          if (!open) {
            setEditRecipientDialog({ open: false, user: null });
            setNewRecipientId("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Editar ID de Webhook do Instagram</AlertDialogTitle>
            <AlertDialogDescription>
              O ID de Webhook é recebido automaticamente quando o Instagram envia a primeira mensagem.
              Você pode configurá-lo manualmente se necessário, usando o ID que aparece nos logs do webhook.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Input
              placeholder="Ex: 17841400000000000"
              value={newRecipientId}
              onChange={(e) => setNewRecipientId(e.target.value)}
              data-testid="input-recipient-id"
            />
            {editRecipientDialog.user && (
              <p className="text-xs text-muted-foreground mt-2">
                Usuário: {editRecipientDialog.user.firstName || editRecipientDialog.user.email}
              </p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-edit-recipient">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (editRecipientDialog.user) {
                  updateRecipientMutation.mutate({
                    userId: editRecipientDialog.user.id,
                    instagramRecipientId: newRecipientId,
                  });
                }
              }}
              disabled={updateRecipientMutation.isPending}
              data-testid="button-save-recipient"
            >
              {updateRecipientMutation.isPending ? "Salvando..." : "Salvar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
