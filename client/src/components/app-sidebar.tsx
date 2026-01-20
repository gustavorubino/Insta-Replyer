import { useLocation, Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Inbox,
  Settings,
  History,
  Bot,
  LogOut,
  User,
  Shield,
  Users,
  AlertTriangle,
} from "lucide-react";
import { SiInstagram } from "react-icons/si";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";

const menuItems = [
  {
    title: "Dashboard",
    url: "/",
    icon: LayoutDashboard,
  },
  {
    title: "Fila de Aprovação",
    url: "/queue",
    icon: Inbox,
  },
  {
    title: "Histórico",
    url: "/history",
    icon: History,
  },
  {
    title: "Configurações",
    url: "/settings",
    icon: Settings,
  },
];

const adminMenuItems = [
  {
    title: "Administração",
    url: "/admin",
    icon: Users,
  },
];

interface AppSidebarProps {
  pendingCount?: number;
}

export function AppSidebar({ pendingCount = 0 }: AppSidebarProps) {
  const [location, navigate] = useLocation();
  const { user } = useAuth();

  const logoutMutation = useMutation({
    mutationFn: async () => {
      if (user?.isAdmin) {
        window.location.href = "/api/logout";
        return;
      }
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      navigate("/");
    },
  });

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-gradient-to-br from-pink-500 via-purple-500 to-orange-500">
            <SiInstagram className="h-5 w-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold">Instagram AI</span>
            <span className="text-xs text-muted-foreground">
              Respostas Inteligentes
            </span>
          </div>
        </div>
      </SidebarHeader>
      
      {user?.showTokenWarning && (
        <div className="mx-4 mb-2 p-3 rounded-md bg-destructive/10 border border-destructive/30">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-destructive">
                Conexão expirando
              </span>
              <span className="text-xs text-muted-foreground">
                Sua conexão com o Instagram precisa ser renovada.
              </span>
              <Link 
                href="/settings" 
                className="text-xs text-foreground underline"
                data-testid="link-token-warning-settings"
              >
                Reconectar agora
              </Link>
            </div>
          </div>
        </div>
      )}
      
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                const isActive = location === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      data-active={isActive}
                      className="data-[active=true]:bg-sidebar-accent"
                    >
                      <Link href={item.url} data-testid={`link-${item.title.toLowerCase().replace(/ /g, "-")}`}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                        {item.url === "/queue" && pendingCount > 0 && (
                          <Badge
                            variant="default"
                            className="ml-auto h-5 min-w-5 px-1.5"
                          >
                            {pendingCount}
                          </Badge>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {user?.isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminMenuItems.map((item) => {
                  const isActive = location === item.url;
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        data-active={isActive}
                        className="data-[active=true]:bg-sidebar-accent"
                      >
                        <Link href={item.url} data-testid={`link-${item.title.toLowerCase().replace(/ /g, "-")}`}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="p-4 space-y-3">
        <div className="flex items-center gap-2 rounded-md bg-muted p-3">
          {user?.isAdmin ? (
            <Shield className="h-5 w-5 text-primary" />
          ) : (
            <User className="h-5 w-5 text-muted-foreground" />
          )}
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-xs font-medium truncate" data-testid="text-user-name">
              {user?.firstName 
                ? `${user.firstName} ${user.lastName || ''}`.trim() 
                : user?.email?.split('@')[0] || "Usuário"}
            </span>
            <span className="text-xs text-muted-foreground truncate" data-testid="text-user-email">
              {user?.email || ""}
            </span>
            <span className="text-xs text-muted-foreground">
              {user?.isAdmin ? "Administrador" : "Usuário"} [debug:{String(user?.isAdmin)}]
            </span>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
          data-testid="button-logout"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sair
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
