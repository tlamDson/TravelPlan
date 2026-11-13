/**
 * Dashboard Layout Component
 *
 * Section 6: UI State only in Zustand
 * Layout wrapper for authenticated pages
 */

import { type ReactNode, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SettingsModal } from "@/features/settings/components/SettingsModal";
import type { TabId } from "@/features/settings/components/SettingsModal";
import { GlobalJobWatcher } from "@/features/planner/components/GlobalJobWatcher";
import {
  LayoutDashboard,
  Map,
  Plane,
  Bot,
  Menu,
  X,
  LogOut,
  Settings,
  User,
} from "lucide-react";
import { useTranslationStore } from "@/stores/useTranslationStore";
import { useUserMe } from "@/features/user/hooks/useUser";
import { useSubscriptionStore } from "@/stores/useSubscriptionStore";

interface DashboardLayoutProps {
  children: ReactNode;
}

const navItems = [
  { labelKey: "sidebar.dashboard", href: "/dashboard", icon: LayoutDashboard },
  { labelKey: "sidebar.myTrips", href: "/trips", icon: Plane },
  { labelKey: "sidebar.explore", href: "/map", icon: Map },
];

// Not released yet: shown as a disabled "coming soon" entry, not a link to the
// /assistant "In Development" dead end.
const comingSoonNavItem = { labelKey: "sidebar.ai", icon: Bot };

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { t } = useTranslationStore();
  const { data: me } = useUserMe();
  const { isPro, setSubscriptionSnapshot } = useSubscriptionStore();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] =
    useState<TabId>("personal");

  useEffect(() => {
    if (!me) return;
    const usage = me.usage;
    setSubscriptionSnapshot({
      isPro: me.tier === "pro",
      tripsUsedThisCycle: usage?.tripsUsedThisCycle ?? 0,
      tripLimit: usage?.tripLimit ?? 10,
      quotaResetsAt: usage?.quotaResetsAt ?? null,
    });
  }, [me, setSubscriptionSnapshot]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const shouldOpen = params.get("openSettings") === "true";
    const tab = params.get("settingsTab") as TabId | null;
    if (!shouldOpen) return;

    queueMicrotask(() => {
      if (tab) {
        setSettingsInitialTab(tab);
      }
      setIsSettingsOpen(true);
    });

    params.delete("openSettings");
    params.delete("settingsTab");
    const nextSearch = params.toString();
    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : "",
      },
      { replace: true },
    );
  }, [location.pathname, location.search, navigate]);

  const usage = me?.usage;
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const progressPercent =
    isPro || !usage?.tripLimit || usage.tripLimit < 0
      ? 0
      : Math.min(
          100,
          Math.round((usage.tripsUsedThisCycle / usage.tripLimit) * 100),
        );
  const resetDays = usage?.quotaResetsAt
    ? Math.max(
        0,
        Math.ceil(
          (new Date(usage.quotaResetsAt).getTime() - nowMs) /
            (1000 * 60 * 60 * 24),
        ),
      )
    : null;

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile header */}
      <header className="lg:hidden sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="flex items-center justify-between px-4 h-14">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <Link to="/dashboard" className="font-bold text-lg">
            TravelPlan
          </Link>
          <div className="w-9" /> {/* Spacer for alignment */}
        </div>
      </header>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-50 h-full w-64 bg-card border-r transform transition-transform duration-200 ease-in-out lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex flex-col h-full">
          {/* Sidebar header */}
          <div className="flex items-center justify-between px-4 h-14 border-b">
            <Link to="/dashboard" className="font-bold text-lg">
              TravelPlan
            </Link>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 py-4 px-2 space-y-1">
            {navItems.map((item) => {
              const isActive = location.pathname.startsWith(item.href);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent",
                  )}
                  onClick={() => setSidebarOpen(false)}
                >
                  <Icon className="h-5 w-5" />
                  {t(item.labelKey)}
                </Link>
              );
            })}
            <div
              data-testid="nav-ai-coming-soon"
              aria-disabled="true"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground/60 cursor-not-allowed"
            >
              <comingSoonNavItem.icon className="h-5 w-5" />
              <span>{t(comingSoonNavItem.labelKey)}</span>
              <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {t("sidebar.comingSoon")}
              </span>
            </div>
            {!isPro && usage && usage.tripLimit > 0 && (
              <div className="mx-2 mt-4 rounded-lg border bg-muted/30 p-3">
                <p className="text-xs font-medium text-foreground">
                  {t("sidebar.freeTripsUsed")
                    .replace("{used}", String(usage.tripsUsedThisCycle))
                    .replace("{limit}", String(usage.tripLimit))}
                </p>
                <Progress className="mt-2 h-2" value={progressPercent} />
                {resetDays !== null && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t(
                      resetDays === 1
                        ? "sidebar.resetsInOne"
                        : "sidebar.resetsInOther",
                    ).replace("{count}", String(resetDays))}
                  </p>
                )}
              </div>
            )}
          </nav>

          {/* User section */}
          <div className="p-4 border-t">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-2 px-2"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>
                      <User className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate">{t("menu.account")}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>{t("menu.myAccount")}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setIsSettingsOpen(true)}
                  className="cursor-pointer"
                >
                  <Settings className="h-4 w-4 mr-2" />
                  {t("menu.settings")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="cursor-pointer"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  {t("menu.signOut")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="lg:pl-64">
        {/* Page content */}
        <div className="p-4 lg:p-6">{children}</div>
      </main>

      {/* Global Modals & Watchers */}
      <GlobalJobWatcher />
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        initialTab={settingsInitialTab}
      />
    </div>
  );
}
