import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession, useUser } from "@clerk/clerk-react";
import type { SessionWithActivitiesResource } from "@clerk/types";
import { Loader2, MonitorPlay, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useTranslationStore } from "@/stores/useTranslationStore";
import { formatLastActive } from "../lib/session-format";

export function DeviceSessions() {
  const { user } = useUser();
  const { session: currentSession } = useSession();
  const { t, language } = useTranslationStore();
  const queryClient = useQueryClient();
  const queryKey = ["clerk-sessions", user?.id];

  const {
    data: sessions,
    isPending,
    isError,
  } = useQuery({
    queryKey,
    queryFn: () => user!.getSessions(),
    enabled: !!user,
  });

  const revoke = useMutation({
    mutationFn: (session: SessionWithActivitiesResource) => session.revoke(),
    onSuccess: () => {
      toast.success(t("security.toastRevoked"));
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: () => toast.error(t("security.toastRevokeFailed")),
  });

  if (isPending && user) {
    return <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />;
  }
  if (isError) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("security.loadSessionsFailed")}
      </p>
    );
  }
  const active = (sessions ?? []).filter((s) => s.status === "active");
  if (active.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("security.noSessions")}
      </p>
    );
  }

  return (
    <div className="rounded-lg border shadow-sm divide-y">
      {active.map((session) => {
        const a = session.latestActivity;
        const isCurrent = session.id === currentSession?.id;
        const Icon = a?.isMobile ? Smartphone : MonitorPlay;
        const device =
          [a?.browserName, a?.deviceType].filter(Boolean).join(" - ") ||
          t("security.unknownDevice");
        const place = [a?.city, a?.country].filter(Boolean).join(", ");
        const when = isCurrent
          ? t("security.activeNow")
          : formatLastActive(session.lastActiveAt, new Date(), language);
        return (
          <div
            key={session.id}
            className="p-4 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <Icon className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="font-medium text-sm">
                  {device}
                  {isCurrent ? ` (${t("security.thisDevice")})` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {[place, when].filter(Boolean).join(" • ")}
                </p>
              </div>
            </div>
            {!isCurrent && (
              <Button
                variant="ghost"
                size="sm"
                disabled={revoke.isPending}
                onClick={() => revoke.mutate(session)}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                {t("security.btnRevoke")}
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
