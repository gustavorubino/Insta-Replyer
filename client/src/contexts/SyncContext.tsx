import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface SyncProgress {
  stage: string;
  percent: number;
  detail?: string;
  status: 'running' | 'completed' | 'error';
  error?: string;
  result?: {
    username?: string;
    captionsCount?: number;
    interactionCount?: number;
    withReplies?: number;
    message?: string;
  };
}

interface SyncContextValue {
  isSyncing: boolean;
  syncProgress: number;
  syncStatus: string;
  syncError: string | null;
  startSync: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | undefined>(undefined);

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncStatus, setSyncStatus] = useState("");
  const [syncError, setSyncError] = useState<string | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastStatusRef = useRef<'running' | 'completed' | 'error' | null>(null);
  const isPollingRef = useRef<boolean>(false);

  // Function to start polling for sync progress
  const startPolling = () => {
    if (pollingIntervalRef.current) {
      return; // Already polling
    }

    pollingIntervalRef.current = setInterval(async () => {
      // Prevent overlapping requests
      if (isPollingRef.current) {
        return;
      }
      
      isPollingRef.current = true;
      
      try {
        const response = await fetch("/api/knowledge/sync-official/progress", {
          credentials: "include",
        });
        
        if (response.ok) {
          const data: SyncProgress = await response.json();
          
          // Update state based on progress
          if (data.status === 'running') {
            setIsSyncing(true);
            setSyncProgress(data.percent || 0);
            setSyncStatus(data.stage || "Sincronizando...");
            setSyncError(null);
            lastStatusRef.current = 'running';
          } else if (data.status === 'completed' && (lastStatusRef.current === 'running' || (lastStatusRef.current === null && data.percent === 100))) {
            // Sync just completed - handle transition from running or null (after refresh)
            setIsSyncing(false);
            setSyncProgress(100);
            setSyncStatus("Concluído!");
            setSyncError(null);
            
            // Show success toast only if we haven't already shown it
            if (lastStatusRef.current === 'running' || (lastStatusRef.current === null && data.percent === 100)) {
              toast({
                title: "✅ Sincronização Concluída",
                description: data.result?.message || `${data.result?.captionsCount || 0} legendas sincronizadas!`,
              });

              // Invalidate queries to refresh data
              queryClient.invalidateQueries({ queryKey: ["/api/knowledge/instagram-profiles"] });
              queryClient.invalidateQueries({ queryKey: ["/api/brain/dataset"] });
            }

            // Reset state after brief animation
            setTimeout(() => {
              setSyncProgress(0);
              setSyncStatus("");
            }, 2000);

            // Stop polling
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }

            lastStatusRef.current = 'completed';
          } else if (data.status === 'error' && lastStatusRef.current === 'running') {
            // Sync encountered an error
            setIsSyncing(false);
            setSyncProgress(0);
            setSyncStatus("");
            setSyncError(data.error || "Erro ao sincronizar conta");

            // Show error toast
            toast({
              title: "Erro",
              description: data.error || "Erro ao sincronizar conta.",
              variant: "destructive",
            });

            // Stop polling
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }

            lastStatusRef.current = 'error';
          }
        }
      } catch (err) {
        console.error("Progress polling error:", err);
      } finally {
        isPollingRef.current = false;
      }
    }, 1500); // Poll every 1.5 seconds
  };

  // Function to stop polling
  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  // Start sync function
  const startSync = async () => {
    try {
      setIsSyncing(true);
      setSyncProgress(0);
      setSyncStatus("Iniciando...");
      setSyncError(null);
      lastStatusRef.current = 'running';

      const response = await fetch("/api/knowledge/sync-official", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const errorData = await response.json();
        
        // Check if already syncing
        if (errorData.code === "ALREADY_SYNCING") {
          // Just start polling without error
          startPolling();
          return;
        }

        // Handle other errors
        throw new Error(errorData.error || "Erro ao iniciar sincronização");
      }

      // Sync started successfully, begin polling
      startPolling();
    } catch (error: unknown) {
      setIsSyncing(false);
      setSyncProgress(0);
      setSyncStatus("");
      
      let message = "Erro ao sincronizar conta.";
      let title = "Erro";
      
      if (error instanceof Error) {
        const errorStr = error.message;
        if (errorStr.includes("NOT_CONNECTED") || errorStr.includes("não conectada")) {
          title = "Não Conectado";
          message = "Conecte sua conta Instagram primeiro na aba Conexão.";
        } else if (errorStr.includes("INVALID_TOKEN") || errorStr.includes("Token")) {
          title = "Token Expirado";
          message = "Token do Instagram inválido ou expirado. Reconecte sua conta.";
        } else {
          message = errorStr;
        }
      }
      
      setSyncError(message);
      toast({ title, description: message, variant: "destructive" });
    }
  };

  // Check for ongoing sync on mount
  useEffect(() => {
    const checkOngoingSync = async () => {
      try {
        const response = await fetch("/api/knowledge/sync-official/progress", {
          credentials: "include",
        });
        
        if (response.ok) {
          const data: SyncProgress = await response.json();
          
          if (data.status === 'running') {
            // Resume sync state
            setIsSyncing(true);
            setSyncProgress(data.percent || 0);
            setSyncStatus(data.stage || "Sincronizando...");
            lastStatusRef.current = 'running';
            startPolling();
          }
        }
      } catch (err) {
        console.error("Error checking ongoing sync:", err);
      }
    };

    checkOngoingSync();

    // Cleanup on unmount
    return () => {
      stopPolling();
    };
    // Note: toast and queryClient are stable references from hooks and don't need to be in deps
    // startPolling is defined in component scope and uses refs to maintain stable behavior
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: SyncContextValue = {
    isSyncing,
    syncProgress,
    syncStatus,
    syncError,
    startSync,
  };

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSyncContext() {
  const context = useContext(SyncContext);
  if (context === undefined) {
    throw new Error("useSyncContext must be used within a SyncProvider");
  }
  return context;
}
