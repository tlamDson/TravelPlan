import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { MonitorPlay, KeyRound, Users, Loader2 } from "lucide-react";
import { useClerk, useUser } from "@clerk/clerk-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DeviceSessions } from "../components/DeviceSessions";
import { useTranslationStore } from "@/stores/useTranslationStore";

export function SecuritySettings() {
  const { openUserProfile } = useClerk();
  const { user } = useUser();
  const { t } = useTranslationStore();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);

  const hasPassword = user?.passwordEnabled;

  const handleUpdatePassword = async () => {
    if (!user) return;
    if (!currentPassword || !newPassword) {
      toast.error(t("security.toastFillFields"));
      return;
    }
    setIsUpdatingPassword(true);
    try {
      await user.updatePassword({ currentPassword, newPassword });
      toast.success(t("security.toastSavePassword"));
      setCurrentPassword("");
      setNewPassword("");
      setIsPasswordDialogOpen(false);
    } catch (error: unknown) {
      const clerkMsg =
        error &&
        typeof error === "object" &&
        "errors" in error &&
        Array.isArray((error as { errors: { message?: string }[] }).errors)
          ? (error as { errors: { message?: string }[] }).errors[0]?.message
          : undefined;
      toast.error(clerkMsg || "Failed to update password");
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h3 className="text-2xl font-bold tracking-tight">
          {t("security.pageTitle")}
        </h3>
        <p className="text-muted-foreground mt-1">
          {t("security.pageSubtitle")}
        </p>
      </div>

      <Separator />

      <div className="space-y-8">
        {/* Authentication */}
        <section className="space-y-4">
          <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <KeyRound className="w-4 h-4" /> {t("security.authTitle")}
          </h4>
          <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <p className="font-medium">{t("security.passwordAuth")}</p>
              <p className="text-sm text-muted-foreground">
                {t("security.passwordDesc")}
              </p>
            </div>

            {hasPassword ? (
              <Dialog
                open={isPasswordDialogOpen}
                onOpenChange={setIsPasswordDialogOpen}
              >
                <DialogTrigger asChild>
                  <Button variant="outline">
                    {t("security.btnChangePassword")}
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle>
                      {t("security.updatePasswordTitle")}
                    </DialogTitle>
                    <DialogDescription>
                      {t("security.updatePasswordDesc")}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="current-password">
                        {t("security.currentPassword")}
                      </Label>
                      <Input
                        id="current-password"
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="new-password">
                        {t("security.newPassword")}
                      </Label>
                      <Input
                        id="new-password"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-3">
                    <Button
                      variant="outline"
                      onClick={() => setIsPasswordDialogOpen(false)}
                    >
                      {t("security.btnCancel")}
                    </Button>
                    <Button
                      onClick={handleUpdatePassword}
                      disabled={isUpdatingPassword}
                    >
                      {isUpdatingPassword ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : null}
                      {t("security.btnSavePassword")}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            ) : (
              <div className="text-sm text-muted-foreground bg-muted p-3 rounded border">
                {t("security.externalProvider")}
              </div>
            )}
          </div>

          <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <p className="font-medium">{t("security.twoFactor")}</p>
              <p className="text-sm text-muted-foreground">
                {t("security.twoFactorDesc")}
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => openUserProfile()}
              >
                {t("security.btnManage2FA")}
              </Button>
            </div>
          </div>
        </section>

        {/* Device History */}
        <section className="space-y-4">
          <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <MonitorPlay className="w-4 h-4" /> {t("security.deviceHistory")}
          </h4>
          <DeviceSessions />
        </section>

        {/* Shared Access */}
        <section className="space-y-4">
          <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Users className="w-4 h-4" /> {t("security.sharedAccess")}
          </h4>
          <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <p className="font-medium">{t("security.collabApprovals")}</p>
              <p className="text-sm text-muted-foreground">
                {t("security.collabDesc")}
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => toast.success(t("security.toastAccessUpdate"))}
            >
              {t("security.btnManageAccess")}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
