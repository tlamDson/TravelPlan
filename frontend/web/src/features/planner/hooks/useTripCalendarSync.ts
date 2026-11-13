/**
 * Google Calendar sync: incremental OAuth (calendar.events) + POST sync API.
 */

import { useUser } from "@clerk/clerk-react";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { isVipUser } from "@/lib/vip-check";
import { track } from "@/features/analytics";
import { syncTripToCalendar } from "../api/calendar.api";

const SESSION_KEY = "travelplan_pending_calendar_sync_trip";

export const GOOGLE_CALENDAR_EVENTS_SCOPE =
  "https://www.googleapis.com/auth/calendar.events";

type ExternalAccountWithReauthorize = {
  provider: string;
  reauthorize?: (params: {
    additionalScopes: string[];
    redirectUrl: string;
  }) => Promise<unknown>;
};

export function useTripCalendarSync(tripId: string | undefined) {
  const { user, isLoaded } = useUser();
  const ranPendingRef = useRef(false);

  useEffect(() => {
    ranPendingRef.current = false;
  }, [tripId]);

  const { mutate: syncCalendar, isPending: isSyncing } = useMutation({
    mutationFn: () => syncTripToCalendar(tripId!),
    onSuccess: (data) => {
      // The server queues the sync; this marks the request as accepted.
      track("calendar_synced", { tripId: tripId!, provider: "google" });
      toast.success(
        data.message ??
          "Đang đồng bộ lên Google Calendar... Sự kiện sẽ xuất hiện trong ít phút!",
        { duration: 6000 },
      );
    },
    onError: (err: unknown) => {
      const e = err as {
        response?: {
          status?: number;
          data?: { code?: string; message?: string };
        };
      };
      const code = e?.response?.data?.code;
      if (code === "GOOGLE_NOT_CONNECTED") {
        toast.error(
          "Vui lòng đăng nhập bằng tài khoản Google để sử dụng tính năng đồng bộ lịch.",
          { duration: 8000 },
        );
        return;
      }
      if (code === "CALENDAR_VIP_ONLY" || code === "CALENDAR_VIP_REQUIRED") {
        toast.error(
          e?.response?.data?.message ??
            "Tài khoản chưa được bật đồng bộ lịch trên hệ thống.",
          { duration: 6000 },
        );
        return;
      }
      if (e?.response?.status === 404) {
        return;
      }
      toast.error(
        e?.response?.data?.message ?? "Không thể đồng bộ lên Google Calendar.",
      );
    },
  });

  useEffect(() => {
    if (!tripId || !isLoaded || !user) return;
    const pending = sessionStorage.getItem(SESSION_KEY);
    if (pending !== tripId || ranPendingRef.current) return;
    ranPendingRef.current = true;
    sessionStorage.removeItem(SESSION_KEY);
    queueMicrotask(() => {
      syncCalendar();
    });
  }, [tripId, isLoaded, user, syncCalendar]);

  const handleSync = useCallback(async () => {
    if (!tripId) return;
    if (!user) {
      toast.error("Vui lòng đăng nhập.");
      return;
    }
    const email = user.primaryEmailAddress?.emailAddress;
    if (!isVipUser(email)) {
      return;
    }

    // Clerk's OAuthProvider values dropped the "oauth_" prefix (now just
    // "google") — comparing against "oauth_google" never matched, so a
    // linked Google account was never found and this errored out for
    // every user, even ones who signed in with Google.
    const google = user.externalAccounts?.find(
      (a) => a.provider === "google",
    ) as ExternalAccountWithReauthorize | undefined;

    if (!google) {
      toast.error(
        "Vui lòng liên kết tài khoản Google (đăng nhập bằng Google) để đồng bộ lịch.",
        { duration: 8000 },
      );
      return;
    }

    if (typeof google.reauthorize !== "function") {
      toast.error(
        "Không thể xin thêm quyền Calendar từ trình duyệt này. Hãy cập nhật @clerk/clerk-react hoặc kiểm tra cấu hình Clerk.",
        { duration: 8000 },
      );
      return;
    }

    sessionStorage.setItem(SESSION_KEY, tripId);
    try {
      await google.reauthorize({
        additionalScopes: [GOOGLE_CALENDAR_EVENTS_SCOPE],
        redirectUrl: window.location.href.split("#")[0],
      });
      await user.reload?.();
      if (sessionStorage.getItem(SESSION_KEY) === tripId) {
        sessionStorage.removeItem(SESSION_KEY);
        syncCalendar();
      }
    } catch (unknownErr: unknown) {
      sessionStorage.removeItem(SESSION_KEY);
      const clerkErr = unknownErr as {
        errors?: Array<{ message?: string }>;
        message?: string;
      };
      const msg =
        clerkErr?.errors?.[0]?.message ??
        clerkErr?.message ??
        "Không thể cấp quyền Google Calendar.";
      toast.error(msg, { duration: 8000 });
    }
  }, [tripId, user, syncCalendar]);

  const email = user?.primaryEmailAddress?.emailAddress;
  const vip = isVipUser(email);

  return {
    handleSync,
    isSyncing,
    isVip: vip,
    isUserLoaded: isLoaded,
  };
}
