import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import { apiClient } from "@/lib/axios";
import { useSubscriptionStore } from "@/stores/useSubscriptionStore";
import {
  BRAND_GRADIENT_BUTTON,
  BRAND_GRADIENT_WASH,
} from "@/lib/brandGradient";

const reasonText: Record<string, string> = {
  "trip-duration": "6+ day trips require TravelPlan Pro.",
  "monthly-trip-limit": "You have reached the free monthly trip limit.",
  "regen-limit": "You have used all free regenerations for this trip.",
  "advanced-ai-tuning": "This advanced AI tuning option is available on Pro.",
  "general-upgrade": "Upgrade to unlock premium planning features.",
};

export function UpgradeModal() {
  const { isUpgradeModalOpen, closeUpgradeModal, upgradeReason } =
    useSubscriptionStore();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleCheckout = async () => {
    setErrorMessage(null);
    setIsLoading(true);
    try {
      const res = await apiClient.post("/billing/create-checkout-session", {
        plan: "pro_monthly",
      });
      const checkoutUrl: string | undefined = res?.data?.url;
      if (!checkoutUrl) {
        throw new Error("Missing checkout URL");
      }
      window.location.href = checkoutUrl;
    } catch {
      setErrorMessage(
        "Could not connect to payment provider. Please try again later.",
      );
      setIsLoading(false);
    }
  };

  return (
    <Dialog
      open={isUpgradeModalOpen}
      onOpenChange={(open) => {
        if (isLoading) return;
        if (!open) closeUpgradeModal();
      }}
    >
      <DialogContent className="max-w-md overflow-hidden border border-white/30 bg-white/15 text-foreground backdrop-blur-xl">
        <div className={`absolute inset-0 -z-10 ${BRAND_GRADIENT_WASH}`} />
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="h-5 w-5 text-purple-500" />
            Upgrade to TravelPlan Pro
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {reasonText[upgradeReason] ?? reasonText["general-upgrade"]}
          </p>
          <div className="rounded-lg border border-purple-200/60 bg-background/70 p-3">
            <p className="text-sm text-muted-foreground">Pro plan</p>
            <p className="text-2xl font-bold">$10/month</p>
          </div>
          {errorMessage && (
            <p className="rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-600">
              {errorMessage}
            </p>
          )}
          <Button
            className={`w-full ${BRAND_GRADIENT_BUTTON}`}
            onClick={handleCheckout}
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Securely connecting to Stripe...
              </span>
            ) : (
              "Upgrade Now with Stripe"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
