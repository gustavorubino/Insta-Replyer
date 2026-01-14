import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users,
  Shield,
  ShieldOff,
  RefreshCw,
  User,
  Mail,
  Calendar,
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";

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

  const { data: users, isLoading: isLoadingUsers } = useQuery<UserData[]>({
    queryKey: ["/api/auth/users"],
    enabled: !!user?.isAdmin,
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

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Administração</h1>
        <p className="text-muted-foreground">
          Gerencie usuários e permissões do sistema
        </p>
      </div>

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
    </div>
  );
}
