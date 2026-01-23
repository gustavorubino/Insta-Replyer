import { Switch, Route } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageToggle } from "@/components/language-toggle";
import { LanguageProvider } from "@/i18n";
import { AppSidebar } from "@/components/app-sidebar";
import { useAuth } from "@/hooks/use-auth";
import {
  SidebarProvider,
  SidebarTrigger,
  SidebarInset,
} from "@/components/ui/sidebar";
import Dashboard from "@/pages/dashboard";
import Queue from "@/pages/queue";
import History from "@/pages/history";
import Settings from "@/pages/settings";
import Admin from "@/pages/admin";
import Landing from "@/pages/landing";
import Login from "@/pages/login";
import NotFound from "@/pages/not-found";
import type { MessageWithResponse } from "@shared/schema";
import { Loader2 } from "lucide-react";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/queue/comments">{() => <Queue defaultFilter="comment" />}</Route>
      <Route path="/queue/dms">{() => <Queue defaultFilter="dm" />}</Route>
      <Route path="/queue" component={Queue} />
      <Route path="/history" component={History} />
      <Route path="/settings" component={Settings} />
      <Route path="/admin" component={Admin} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppLayout() {
  const { data: pendingMessages } = useQuery<MessageWithResponse[]>({
    queryKey: ["/api/messages/pending"],
    refetchInterval: 30000,
  });

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar pendingCount={pendingMessages?.length || 0} />
        <SidebarInset className="flex flex-col flex-1 overflow-hidden">
          <header className="flex h-14 items-center justify-between gap-4 border-b px-4 bg-background">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex items-center gap-2">
              <LanguageToggle />
              <ThemeToggle />
            </div>
          </header>
          <main className="flex-1 overflow-auto bg-background">
            <Router />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

function LoadingSpinner() {
  return (
    <div className="h-screen w-screen flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

function PublicRoutes() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route component={Landing} />
    </Switch>
  );
}

function AuthenticatedApp() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!user) {
    return <PublicRoutes />;
  }

  return <AppLayout />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider defaultLanguage="pt-BR">
        <ThemeProvider defaultTheme="light" storageKey="instagram-ai-theme">
          <TooltipProvider>
            <AuthenticatedApp />
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

export default App;
