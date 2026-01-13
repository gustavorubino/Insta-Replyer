import { useLocation, Link } from "wouter";
import {
  LayoutDashboard,
  Inbox,
  Settings,
  History,
  MessageSquare,
  Bot,
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

interface AppSidebarProps {
  pendingCount?: number;
}

export function AppSidebar({ pendingCount = 0 }: AppSidebarProps) {
  const [location] = useLocation();

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
      </SidebarContent>
      <SidebarFooter className="p-4">
        <div className="flex items-center gap-2 rounded-md bg-muted p-3">
          <Bot className="h-5 w-5 text-muted-foreground" />
          <div className="flex flex-col">
            <span className="text-xs font-medium">Modo de Operação</span>
            <span className="text-xs text-muted-foreground">Manual</span>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
