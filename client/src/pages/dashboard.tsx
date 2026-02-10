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
import { useLanguage } from "@/i18n";
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
  const { t } = useLanguage();

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/stats"],
    refetchInterval: 5000, // Auto-refresh every 5 seconds
  });

  const { data: recentMessages, isLoading: messagesLoading } = useQuery<
    MessageWithResponse[]
  >({
    queryKey: ["/api/messages/recent"],
    refetchInterval: 5000, // Auto-refresh every 5 seconds
  });

  const { data: user } = useQuery<{
    operationMode: "manual" | "semi_auto" | "auto";
    confidenceThreshold: number;
  }>({
    queryKey: ["/api/settings"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });


  const getOperationModeLabel = () => {
    if (!user) return t.settings.mode.manual.split(" ")[0]; // Fallback to "Modo"

    switch (user.operationMode) {
      case "manual":
        return "Manual (100% aprovação)";
      case "semi_auto":
        return `Semi-Automático (≥${user.confidenceThreshold}% auto)`;
      case "auto":
        return "Automático (100% auto)";
      default:
        return "Manual";
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t.dashboard.title}</h1>
        <p className="text-muted-foreground">
          {t.dashboard.subtitle}
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
              title={t.dashboard.pendingApproval}
              value={stats?.pendingMessages || 0}
              description={t.queue.empty.split(".")[0]}
              icon={Clock}
            />
            <StatsCard
              title={t.history.approved}
              value={stats?.approvedToday || 0}
              description={t.queue.send}
              icon={CheckCircle}
              trend={{ value: 12, isPositive: true }}
            />
            <StatsCard
              title={t.dashboard.autoReplied}
              value={stats?.autoSentToday || 0}
              description={t.history.autoSent}
              icon={Bot}
            />
            <StatsCard
              title={t.dashboard.avgConfidence}
              value={`${Math.round((stats?.avgConfidence || 0) * 100)}%`}
              description={t.queue.confidence}
              icon={TrendingUp}
            />
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-medium">
              {t.dashboard.recentActivity}
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
                    senderUsername={msg.senderUsername}
                    senderAvatar={msg.senderAvatar}
                    timestamp={new Date(msg.createdAt)}
                    preview={(msg.content || '[Mídia]').slice(0, 50)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                {t.dashboard.noActivity}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-medium">
              {t.dashboard.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm">{t.dashboard.totalMessages}</span>
              <span className="text-sm font-medium">
                {stats?.totalMessages || 0}
              </span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-sm">{t.history.approved}</span>
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
              <span className="text-sm">{t.settings.tabs.mode}</span>
              <span className="text-sm font-medium text-amber-600">
                {getOperationModeLabel()}
              </span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-sm">{t.settings.tabs.connection}</span>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-green-500"></span>
                <span className="text-sm font-medium text-green-600">
                  {t.settings.connection.connected}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
