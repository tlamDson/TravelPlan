import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useThemeStore } from "@/stores/useThemeStore";
import { useTranslationStore } from "@/stores/useTranslationStore";

export function AppearanceSettings() {
  const { theme, setTheme } = useThemeStore();
  const { t } = useTranslationStore();

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h3 className="text-2xl font-bold tracking-tight">
          {t("appr.pageTitle")}
        </h3>
        <p className="text-muted-foreground mt-1">{t("appr.pageSubtitle")}</p>
      </div>

      <Separator />

      <div className="space-y-8">
        {/* Theme */}
        <section className="space-y-4">
          <h4 className="text-sm font-semibold text-foreground">
            {t("appr.themeTitle")}
          </h4>
          <p className="text-sm text-muted-foreground">{t("appr.themeDesc")}</p>
          {/*
            The mini mockups below (raw white/slate/zinc shades) are a
            deliberate exception to the no-raw-palette rule: they render a
            literal preview of what light/dark mode looks like, so they
            must NOT follow the app's own active theme. Only the outer
            card's selected/unselected state (border-primary/bg-muted
            above) follows the theme like normal chrome.
          */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            {/* Light Mode */}
            <button
              onClick={() => setTheme("light")}
              className={`flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                theme === "light"
                  ? "border-primary bg-primary/10"
                  : "border-transparent bg-muted hover:bg-muted/80"
              }`}
            >
              <div className="w-full h-24 rounded-md bg-white border shadow-sm flex items-center justify-center p-2">
                <div className="w-full h-full bg-slate-100 rounded border flex flex-col gap-2 p-2 relative overflow-hidden">
                  <div className="w-1/2 h-2 bg-slate-300 rounded" />
                  <div className="w-3/4 h-2 bg-slate-200 rounded" />
                  <div className="w-1/4 h-2 bg-emerald-500 rounded" />
                </div>
              </div>
              <span className="font-medium text-sm">
                {t("appr.themeLight")}
              </span>
            </button>

            {/* Dark Mode */}
            <button
              onClick={() => setTheme("dark")}
              className={`flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                theme === "dark"
                  ? "border-primary bg-primary/10"
                  : "border-transparent bg-muted hover:bg-muted/80"
              }`}
            >
              <div className="w-full h-24 rounded-md bg-zinc-950 border border-zinc-800 shadow-sm flex items-center justify-center p-2">
                <div className="w-full h-full bg-zinc-900 rounded border border-zinc-800 flex flex-col gap-2 p-2 relative overflow-hidden">
                  <div className="w-1/2 h-2 bg-zinc-700 rounded" />
                  <div className="w-3/4 h-2 bg-zinc-800 rounded" />
                  <div className="w-1/4 h-2 bg-emerald-500 rounded" />
                </div>
              </div>
              <span className="font-medium text-sm">{t("appr.themeDark")}</span>
            </button>

            {/* System Mode */}
            <button
              onClick={() => setTheme("system")}
              className={`flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                theme === "system"
                  ? "border-primary bg-primary/10"
                  : "border-transparent bg-muted hover:bg-muted/80"
              }`}
            >
              <div className="w-full h-24 rounded-md bg-gradient-to-br from-white to-zinc-950 border shadow-sm flex items-center justify-center p-2">
                <div className="w-full h-full bg-gradient-to-br from-slate-100 to-zinc-900 rounded border border-zinc-500/50 flex flex-col gap-2 p-2 relative overflow-hidden">
                  <div className="w-1/2 h-2 bg-zinc-500 rounded" />
                  <div className="w-3/4 h-2 bg-zinc-600 rounded" />
                  <div className="w-1/4 h-2 bg-emerald-500 rounded" />
                </div>
              </div>
              <span className="font-medium text-sm">
                {t("appr.themeSystem")}
              </span>
            </button>
          </div>
        </section>

        {/* Accessibility */}
        <section className="space-y-4">
          <h4 className="text-sm font-semibold text-foreground">
            {t("appr.accTitle")}
          </h4>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg border bg-card shadow-sm">
              <div className="space-y-0.5 pr-4">
                <Label
                  htmlFor="high-contrast"
                  className="text-base font-medium"
                >
                  {t("appr.highContrast")}
                </Label>
                <p className="text-sm text-muted-foreground w-11/12">
                  {t("appr.highContrastDesc")}
                </p>
              </div>
              <Switch id="high-contrast" />
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg border bg-card shadow-sm">
              <div className="space-y-0.5 pr-4">
                <Label
                  htmlFor="infinite-scroll"
                  className="text-base font-medium"
                >
                  {t("appr.infiniteScroll")}
                </Label>
                <p className="text-sm text-muted-foreground w-11/12">
                  {t("appr.infiniteScrollDesc")}
                </p>
              </div>
              <Switch id="infinite-scroll" defaultChecked />
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg border bg-card shadow-sm">
              <div className="space-y-0.5 pr-4">
                <Label htmlFor="map-controls" className="text-base font-medium">
                  {t("appr.mapControls")}
                </Label>
                <p className="text-sm text-muted-foreground w-11/12">
                  {t("appr.mapControlsDesc")}
                </p>
              </div>
              <Switch id="map-controls" defaultChecked />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
