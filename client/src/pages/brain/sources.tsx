import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Trash2,
  RefreshCw,
  Instagram,
  CheckCircle,
  AlertCircle,
  Link as LinkIcon,
  FileText,
  Upload,
  ExternalLink
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// ==========================================
// 1. COMPONENTS INTERNOS (SAFE UI)
// ==========================================

const ConfirmationModal = ({ isOpen, onClose, onConfirm, isLoading }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl max-w-md w-full p-6 transform transition-all scale-100">
        <div className="flex items-center gap-3 mb-4 text-red-600 dark:text-red-500">
          <AlertCircle className="h-8 w-8" />
          <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Desconectar Conta Oficial?
          </h3>
        </div>

        <p className="text-slate-600 dark:text-slate-300 mb-6 leading-relaxed">
          Esta ação é <strong>irreversível</strong>.
          <br />
          Todos os posts clonados e o histórico de aprendizado serão <span className="text-red-600 font-bold">apagados permanentemente</span> do sistema.
          <br /><br />
          <span className="text-amber-600 dark:text-amber-400 text-sm bg-amber-50 dark:bg-amber-950/30 p-2 rounded block border border-amber-200 dark:border-amber-800">
            ✨ Suas correções manuais (Ouro) serão preservadas.
          </span>
        </p>

        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2.5 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 rounded-lg transition-colors border border-transparent"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-md hover:shadow-lg transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Limpando...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                Sim, Desconectar e Limpar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 2. TYPES & INTERFACES
// ==========================================

interface User {
  id: number;
  username: string;
  instagramUsername?: string;
  instagramAccessToken?: string;
}

interface Stats {
  mediaLibrary: { count: number; limit: number };
  interactionDialect: { count: number; limit: number };
}

// ==========================================
// 3. MAIN PAGE COMPONENT
// ==========================================

export default function Sources() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // --- STATE ---
  const [isDisconnectDialogOpen, setIsDisconnectDialogOpen] = useState(false);

  // Sync States
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncStatus, setSyncStatus] = useState("Aguardando início...");

  // --- QUERIES ---
  const { data: user, isLoading: isUserLoading } = useQuery<User>({
    queryKey: ["/api/user"],
  });

  const { data: stats } = useQuery<Stats>({
    queryKey: ["/api/brain/stats"],
  });

  // --- MUTATIONS ---
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      // Usando a rota correta do backend (api/brain/disconnect)
      const response = await apiRequest("POST", "/api/brain/disconnect", {});
      if (!response.ok) {
        throw new Error("Falha ao desconectar");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Conta Desconectada",
        description: "Todos os dados foram limpos com sucesso.",
        className: "bg-green-600 text-white border-none",
      });
      setIsDisconnectDialogOpen(false);

      // FORCE RELOAD para limpar completamente o estado visual e caches
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    },
    onError: () => {
      toast({
        title: "Erro ao desconectar",
        description: "Tente novamente mais tarde.",
        variant: "destructive",
      });
    },
  });

  // --- ACTIONS ---

  const startSync = () => {
    if (isSyncing) return;

    setIsSyncing(true);
    setSyncProgress(0);
    setSyncStatus("Conectando ao Instagram...");

    // SSE Connection
    const eventSource = new EventSource("/api/brain/sync-knowledge/stream");

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "progress") {
          setSyncProgress(data.progress);
          setSyncStatus(data.detail || data.step);
        } else if (data.type === "complete") {
          eventSource.close();
          setIsSyncing(false);
          setSyncProgress(100);
          setSyncStatus("Concluído!");

          queryClient.invalidateQueries({ queryKey: ["/api/brain/stats"] });
          queryClient.invalidateQueries({ queryKey: ["/api/user"] });

          toast({
            title: "Sincronização Finalizada",
            description: "Seus dados foram atualizados com sucesso.",
            className: "bg-purple-600 text-white border-none",
          });
        } else if (data.type === "error") {
          eventSource.close();
          setIsSyncing(false);
          toast({
            title: "Erro na Sincronização",
            description: data.message || "Ocorreu um erro desconhecido.",
            variant: "destructive",
          });
        }
      } catch (err) {
        console.error("Erro no SSE:", err);
      }
    };

    eventSource.onerror = (err) => {
      console.error("SSE Error Connection:", err);
      eventSource.close();
      setIsSyncing(false);
      toast({
        title: "Conexão Perdida",
        description: "A conexão com o servidor foi interrompida.",
        variant: "destructive",
      });
    };
  };

  if (isUserLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  const isConnected = !!user?.instagramAccessToken;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8 font-sans">

      {/* HEADER */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Fontes de Conhecimento</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-2">
          Gerencie as conexões que alimentam a identidade da sua IA.
        </p>
      </div>

      {/* INSTAGRAM SECTION - CRITICAL */}
      <div className="bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 dark:border-slate-900 bg-slate-50/50 dark:bg-slate-900/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-gradient-to-tr from-purple-500 to-orange-500 rounded-lg p-0.5 flex items-center justify-center text-white shadow-md">
              <Instagram className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Instagram Oficial</h2>
              <p className="text-sm text-slate-500">Fonte primária de personalidade</p>
            </div>
          </div>

          {isConnected && (
            <div className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 border border-green-200 dark:border-green-800">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              ONLINE
            </div>
          )}
        </div>

        <div className="p-6">
          {!isConnected ? (
            <div className="text-center py-12 px-4">
              <div className="h-16 w-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                <Instagram className="h-8 w-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">Conecte sua conta</h3>
              <p className="text-slate-500 mb-6 max-w-sm mx-auto">
                Para clonar sua personalidade, precisamos ler seus posts e comentários antigos.
              </p>
              <button
                onClick={() => window.location.href = "/api/auth/instagram"}
                className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2.5 px-6 rounded-lg transition-colors shadow-lg shadow-purple-200 dark:shadow-purple-900/20 flex items-center mx-auto gap-2"
              >
                <Instagram className="h-4 w-4" />
                Conectar Instagram Agora
              </button>
            </div>
          ) : (
            <div className="space-y-8">
              {/* CONNECTED STATUS CARD */}
              <div className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/20 border border-emerald-100 dark:border-emerald-900 rounded-xl p-6 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
                <div className="flex items-center gap-4 z-10">
                  <div className="h-16 w-16 rounded-full bg-white dark:bg-slate-800 p-1 shadow-sm border border-emerald-200 dark:border-emerald-800">
                    <div className="h-full w-full rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center overflow-hidden">
                      {/* Avatar Placeholder */}
                      <span className="text-xl font-bold text-slate-400">
                        {(user?.instagramUsername || "U").charAt(0).toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-emerald-950 dark:text-emerald-50 flex items-center gap-2">
                      @{user?.instagramUsername}
                      <CheckCircle className="h-5 w-5 text-emerald-500" />
                    </h3>
                    <p className="text-emerald-700 dark:text-emerald-300">
                      Sincronização de dados ativa
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setIsDisconnectDialogOpen(true)}
                  className="z-10 bg-white hover:bg-red-50 text-red-600 border border-red-200 font-semibold py-2 px-4 rounded-lg transition-colors flex items-center gap-2 shadow-sm"
                >
                  <Trash2 className="h-4 w-4" />
                  Desconectar
                </button>

                {/* Background Decor */}
                <div className="absolute right-0 top-0 h-full w-1/3 bg-emerald-100/50 dark:bg-emerald-900/10 skew-x-12 blur-3xl -z-0" />
              </div>

              {/* STATS & SYNC */}
              <div>
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg border border-slate-100 dark:border-slate-800 text-center">
                    <span className="block text-3xl font-bold text-slate-800 dark:text-slate-100">
                      {stats?.mediaLibrary?.count || 0}
                    </span>
                    <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Posts Indexados</span>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg border border-slate-100 dark:border-slate-800 text-center">
                    <span className="block text-3xl font-bold text-slate-800 dark:text-slate-100">
                      {stats?.interactionDialect?.count || 0}
                    </span>
                    <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Interações (Threads)</span>
                  </div>
                </div>

                {/* SYNC ACTION */}
                <div className="bg-purple-50 dark:bg-purple-950/10 border border-purple-100 dark:border-purple-800 rounded-xl p-6">
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <h4 className="font-semibold text-purple-900 dark:text-purple-100">Sincronização Profunda</h4>
                      <p className="text-sm text-purple-600 dark:text-purple-300">
                        Baixa seus posts, comentários e respostas para treinar a IA.
                      </p>
                    </div>
                    {!isSyncing && (
                      <button
                        onClick={startSync}
                        className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2 rounded-lg font-medium shadow-md shadow-purple-500/20 active:translate-y-0.5 transition-all flex items-center gap-2"
                      >
                        <RefreshCw className="h-4 w-4" />
                        Sincronizar Agora
                      </button>
                    )}
                  </div>

                  {/* PROGRESS BAR */}
                  {isSyncing && (
                    <div className="space-y-2 animate-in fade-in duration-300">
                      <div className="flex justify-between text-xs font-medium text-purple-700 dark:text-purple-400">
                        <span>{syncStatus}</span>
                        <span>{Math.round(syncProgress)}%</span>
                      </div>
                      <div className="h-3 w-full bg-purple-200 dark:bg-purple-900 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-purple-600 transition-all duration-300 ease-out"
                          style={{ width: `${syncProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MODAL */}
      <ConfirmationModal
        isOpen={isDisconnectDialogOpen}
        onClose={() => setIsDisconnectDialogOpen(false)}
        onConfirm={() => disconnectMutation.mutate()}
        isLoading={disconnectMutation.isPending}
      />
    </div>
  );
}
