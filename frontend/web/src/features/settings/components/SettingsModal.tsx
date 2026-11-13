import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  User,
  ShieldCheck,
  Globe,
  Palette,
  Bot,
  PlaneTakeoff,
  Zap,
} from "lucide-react";

// Import the dumb UI components
import { PersonalInfoSettings } from "../pages/PersonalInfoSettings";
import { SecuritySettings } from "../pages/SecuritySettings";
import { LocalizationSettings } from "../pages/LocalizationSettings";
import { AppearanceSettings } from "../pages/AppearanceSettings";
import { AiAssistantSettings } from "../pages/AiAssistantSettings";
import { TravelPreferencesSettings } from "../pages/TravelPreferencesSettings";
import { SubscriptionSettings } from "../pages/SubscriptionSettings";
import { useTranslationStore } from "@/stores/useTranslationStore";
import { Switch } from "@/components/ui/switch";
import { useSubscriptionStore } from "@/stores/useSubscriptionStore";

const SETTINGS_TABS = [
  {
    id: "personal",
    nameKey: "nav.personal",
    icon: User,
    Component: PersonalInfoSettings,
  },
  {
    id: "security",
    nameKey: "nav.security",
    icon: ShieldCheck,
    Component: SecuritySettings,
  },
  {
    id: "localization",
    nameKey: "nav.localization",
    icon: Globe,
    Component: LocalizationSettings,
  },
  {
    id: "appearance",
    nameKey: "nav.appearance",
    icon: Palette,
    Component: AppearanceSettings,
  },
  {
    id: "ai",
    nameKey: "nav.ai",
    icon: Bot,
    Component: AiAssistantSettings,
  },
  {
    id: "preferences",
    nameKey: "nav.preferences",
    icon: PlaneTakeoff,
    Component: TravelPreferencesSettings,
  },
  {
    id: "subscription",
    nameKey: "nav.subscription",
    icon: Zap,
    Component: SubscriptionSettings,
  },
] as const;

export type TabId = (typeof SETTINGS_TABS)[number]["id"];

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: TabId;
}

export function SettingsModal({
  isOpen,
  onClose,
  initialTab,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>("personal");
  const { t } = useTranslationStore();
  const { autoLoadLongTripChunks, setAutoLoadLongTripChunks } =
    useSubscriptionStore();

  const ActiveComponent =
    SETTINGS_TABS.find((tab) => tab.id === activeTab)?.Component ||
    PersonalInfoSettings;

  useEffect(() => {
    if (isOpen && initialTab) {
      queueMicrotask(() => setActiveTab(initialTab));
    }
  }, [isOpen, initialTab]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      {/* No description: the title plus the labelled tabs say what this is. */}
      <DialogContent
        aria-describedby={undefined}
        className="max-w-4xl p-0 overflow-hidden gap-0 bg-background h-[85vh] md:h-[700px] flex flex-col md:flex-row">
        <DialogTitle className="sr-only">{t("settings.title")}</DialogTitle>
        {/* Sidebar Navigation */}
        <aside className="w-full md:w-64 bg-muted/30 border-r md:h-full flex flex-col shrink-0">
          <div className="p-6 pb-4">
            <h2 className="text-2xl font-bold tracking-tight">
              {t("settings.title")}
            </h2>
          </div>
          <nav className="flex-1 px-4 space-y-1 overflow-y-auto overflow-x-hidden md:py-2 flex flex-row md:flex-col pb-4 md:pb-0 gap-2 md:gap-0 border-b md:border-b-0 hide-scrollbar">
            {SETTINGS_TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors w-full whitespace-nowrap md:whitespace-normal shrink-0 ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                  }`}
                >
                  <tab.icon
                    className={`w-4 h-4 ${isActive ? "text-primary-foreground" : ""}`}
                  />
                  {t(tab.nameKey)}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-6 lg:p-10 relative">
          <div className="max-w-2xl mx-auto pb-8">
            <div className="mb-6 rounded-lg border bg-muted/30 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">
                    {t("settings.autoLoadLabel")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("settings.autoLoadDesc")}
                  </p>
                </div>
                <Switch
                  checked={autoLoadLongTripChunks}
                  onCheckedChange={setAutoLoadLongTripChunks}
                />
              </div>
            </div>
            <ActiveComponent />
          </div>
        </main>
      </DialogContent>
    </Dialog>
  );
}
