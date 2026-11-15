import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Bot } from "lucide-react";

interface BackgroundProcessingModalProps {
  isProcessing: boolean;
  currentStep?: string | null;
}

export function BackgroundProcessingModal({
  isProcessing,
  currentStep,
}: BackgroundProcessingModalProps) {
  const [hasShownModal, setHasShownModal] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const wantsRetry =
      Boolean(currentStep?.toLowerCase().includes("retry")) && !hasShownModal;
    if (wantsRetry) {
      queueMicrotask(() => {
        setHasShownModal(true);
        setOpen(true);
      });
      return;
    }
    if (!isProcessing || hasShownModal) return;
    const timer = window.setTimeout(() => {
      setHasShownModal(true);
      setOpen(true);
    }, 15000);
    return () => window.clearTimeout(timer);
  }, [isProcessing, hasShownModal, currentStep]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="sm:max-w-md"
        data-testid="background-processing-modal"
      >
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <DialogTitle>AI is working</DialogTitle>
          </div>
          <DialogDescription className="pt-2 text-base">
            You can leave this page. We will notify you when your itinerary is
            ready.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-end mt-4">
          <Button
            data-testid="background-processing-dismiss"
            onClick={() => setOpen(false)}
          >
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
