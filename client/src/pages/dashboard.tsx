import { useQuery } from "@tanstack/react-query";
import {
  MessageSquare,
  CheckCircle,
  XCircle,
  Bot,
  TrendingUp,
  Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatsCard } from "@/components/stats-card";
import { ActivityItem } from "@/components/activity-item";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import type { MessageWithResponse } from "@shared/schema";

interface DashboardStats {
  totalMessages: number;
  pendingMessages: number;
  approvedToday: number;
  rejectedToday: number;
  autoSentToday: number;
  avgConfidence: number;
}

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/stats"],
  });

  const { data: recentMessages, isLoading: messagesLoading } = useQuery<
    MessageWithResponse[]
  >({
    queryKey: ["/api/messages/recent"],
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground">
          Visão geral das suas respostas automáticas
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statsLoading ? (
          <>
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-4" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="h-3 w-32 mt-1" />
                </CardContent>
              </Card>
            ))}
          </>
        ) : (
          <>
            <StatsCard
              title="Mensagens Pendentes"
              value={stats?.pendingMessages || 0}
              description="Aguardando aprovação"
              icon={Clock}
            />
            <StatsCard
              title="Aprovadas Hoje"
              value={stats?.approvedToday || 0}
              description="Respostas enviadas"
              icon={CheckCircle}
              trend={{ value: 12, isPositive: true }}
            />
            <StatsCard
              title="Auto-Enviadas"
              value={stats?.autoSentToday || 0}
              description="Pela IA automaticamente"
              icon={Bot}
            />
            <StatsCard
              title="Confiança Média"
              value={`${Math.round((stats?.avgConfidence || 0) * 100)}%`}
              description="Das respostas da IA"
              icon={TrendingUp}
            />
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-medium">
              Atividade Recente
            </CardTitle>
          </CardHeader>
          <CardContent>
            {messagesLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-start gap-3">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <div className="flex-1">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-3 w-24 mt-1" />
                    </div>
                  </div>
                ))}
              </div>
            ) : recentMessages && recentMessages.length > 0 ? (
              <div className="divide-y">
                {recentMessages.slice(0, 5).map((msg) => (
                  <ActivityItem
                    key={msg.id}
                    type={
                      msg.status === "approved"
                        ? "approved"
                        : msg.status === "rejected"
                        ? "rejected"
                        : msg.status === "auto_sent"
                        ? "auto_sent"
                        : "received"
                    }
                    messageType={msg.type as "dm" | "comment"}
                    senderName={msg.senderName}
                    senderAvatar={msg.senderAvatar}
                    timestamp={new Date(msg.createdAt)}
                    preview={(msg.content || '[Mídia]').slice(0, 50)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhuma atividade recente
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-medium">
              Resumo do Sistema
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm">Total de Mensagens</span>
              <span className="text-sm font-medium">
                {stats?.totalMessages || 0}
              </span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-sm">Taxa de Aprovação</span>
              <span className="text-sm font-medium text-green-600">
                {stats && stats.approvedToday + stats.rejectedToday > 0
                  ? Math.round(
                      (stats.approvedToday /
                        (stats.approvedToday + stats.rejectedToday)) *
                        100
                    )
                  : 0}
                %
              </span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-sm">Modo de Operação</span>
              <span className="text-sm font-medium text-amber-600">Manual</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-sm">Status da Conexão</span>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-green-500"></span>
                <span className="text-sm font-medium text-green-600">
                  Conectado
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
