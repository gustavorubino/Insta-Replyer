import { useState } from "react";
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
  ChevronDown,
  MessageCircle,
  MessageSquare,
  Brain,
  Book,
  BookOpen,
  Gamepad2,
  Plug,
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
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLanguage } from "@/i18n";

interface AppSidebarProps {
  pendingCount?: number;
}

export function AppSidebar({ pendingCount = 0 }: AppSidebarProps) {
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  const { t } = useLanguage();
  const [queueOpen, setQueueOpen] = useState(() => location.startsWith("/queue"));

  const isQueueActive = location.startsWith("/queue");

  const menuItems = [
    {
      title: t.nav.dashboard,
      url: "/",
      icon: LayoutDashboard,
    },
    {
      title: t.nav.history,
      url: "/history",
      icon: History,
    },
  ];

  const brainItems = [
    {
      title: "Personalidade",
      url: "/brain/personality",
      icon: Brain,
    },
    {
      title: "Fontes",
      url: "/brain/sources",
      icon: Book,
    },
    {
      title: "Diretrizes",
      url: "/brain/guidelines",
      icon: BookOpen,
    },
    {
      title: "Treinador",
      url: "/brain/trainer",
      icon: Gamepad2,
    },
  ];

  const settingsItems = [
    {
      title: "Conexões",
      url: "/connections",
      icon: Plug,
    },
  ];

  const queueSubItems = [
    {
      title: t.nav.queueComments,
      url: "/queue/comments",
      icon: MessageCircle,
    },
    {
      title: t.nav.queueDms,
      url: "/queue/dms",
      icon: MessageSquare,
    },
  ];

  const adminMenuItems = [
    {
      title: t.nav.admin,
      url: "/admin",
      icon: Users,
    },
  ];

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
            <span className="text-sm font-semibold">{t.sidebar.title}</span>
            <span className="text-xs text-muted-foreground">
              {t.sidebar.subtitle}
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
                {t.sidebar.tokenWarning}
              </span>
              <span className="text-xs text-muted-foreground">
                {t.sidebar.tokenWarningDesc}
              </span>
              <Link 
                href="/settings" 
                className="text-xs text-foreground underline"
                data-testid="link-token-warning-settings"
              >
                {t.sidebar.reconnectNow}
              </Link>
            </div>
          </div>
        </div>
      )}
      
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t.nav.menu}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {/* Dashboard */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  data-active={location === "/"}
                  className="data-[active=true]:bg-sidebar-accent"
                >
                  <Link href="/" data-testid="link-dashboard">
                    <LayoutDashboard className="h-4 w-4" />
                    <span>{t.nav.dashboard}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Queue with submenu */}
              <Collapsible
                open={queueOpen}
                onOpenChange={setQueueOpen}
                className="group/collapsible"
              >
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                      data-active={isQueueActive}
                      className="data-[active=true]:bg-sidebar-accent"
                      data-testid="link-queue"
                    >
                      <Inbox className="h-4 w-4" />
                      <span>{t.nav.queue}</span>
                      {pendingCount > 0 && (
                        <Badge
                          variant="default"
                          className="ml-auto h-5 min-w-5 px-1.5"
                        >
                          {pendingCount}
                        </Badge>
                      )}
                      <ChevronDown className="ml-auto h-4 w-4 shrink-0 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {queueSubItems.map((item) => {
                        const isActive = location === item.url;
                        return (
                          <SidebarMenuSubItem key={item.url}>
                            <SidebarMenuSubButton
                              asChild
                              isActive={isActive}
                            >
                              <Link href={item.url} data-testid={`link-${item.url.replace("/queue/", "queue-")}`}>
                                <item.icon className="h-4 w-4" />
                                <span>{item.title}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        );
                      })}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>

              {/* Other menu items */}
              {menuItems.filter(item => item.url !== "/").map((item) => {
                const isActive = location === item.url;
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      data-active={isActive}
                      className="data-[active=true]:bg-sidebar-accent"
                    >
                      <Link href={item.url} data-testid={`link-${item.url.replace("/", "") || "dashboard"}`}>
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

        {/* AI Brain Group */}
        <SidebarGroup>
          <SidebarGroupLabel>Cérebro da IA</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {brainItems.map((item) => {
                const isActive = location === item.url;
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      data-active={isActive}
                      className="data-[active=true]:bg-sidebar-accent"
                    >
                      <Link href={item.url}>
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

        {/* Settings Group */}
        <SidebarGroup>
          <SidebarGroupLabel>Configurações</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {settingsItems.map((item) => {
                const isActive = location === item.url;
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      data-active={isActive}
                      className="data-[active=true]:bg-sidebar-accent"
                    >
                      <Link href={item.url}>
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

        {user?.isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminMenuItems.map((item) => {
                  const isActive = location === item.url;
                  return (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton
                        asChild
                        data-active={isActive}
                        className="data-[active=true]:bg-sidebar-accent"
                      >
                        <Link href={item.url} data-testid={`link-${item.url.replace("/", "")}`}>
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
                : user?.email?.split('@')[0] || t.sidebar.user}
            </span>
            <span className="text-xs text-muted-foreground truncate" data-testid="text-user-email">
              {user?.email || ""}
            </span>
            <span className="text-xs text-muted-foreground">
              {user?.isAdmin ? t.sidebar.administrator : t.sidebar.user}
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
          {t.nav.logout}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
