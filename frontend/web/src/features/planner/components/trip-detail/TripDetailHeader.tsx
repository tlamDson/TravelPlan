import type { ReactNode } from "react";
import { Edit2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslationStore } from "@/stores/useTranslationStore";
import { SaveTripCta } from "./SaveTripCta";

interface TripDetailHeaderProps {
  tripTitleLocalized: string;
  isEditingTitle: boolean;
  editTitleValue: string;
  onEditTitleValueChange: (v: string) => void;
  onStartEditTitle: () => void;
  onSaveTitle: () => void;
  onCancelEditTitle: () => void;
  onTitleKeyDown: (e: React.KeyboardEvent) => void;
  isUpdatingTrip: boolean;
  /** Trip actions menu (dates + status + tools) */
  actions: ReactNode;
}

export function TripDetailHeader({
  tripTitleLocalized,
  isEditingTitle,
  editTitleValue,
  onEditTitleValueChange,
  onStartEditTitle,
  onSaveTitle,
  onCancelEditTitle,
  onTitleKeyDown,
  isUpdatingTrip,
  actions,
}: TripDetailHeaderProps) {
  const { t } = useTranslationStore();

  return (
    <div className="flex flex-row items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        {isEditingTitle ? (
          <div className="flex items-center gap-1 flex-wrap">
            <Input
              autoFocus
              value={editTitleValue}
              onChange={(e) => onEditTitleValueChange(e.target.value)}
              onKeyDown={onTitleKeyDown}
              disabled={isUpdatingTrip}
              className="h-9 md:h-10 text-xl font-bold md:text-3xl w-[200px] md:min-w-[280px] md:max-w-[min(100%,420px)] shadow-sm"
              aria-label={t("trip.editTitle")}
            />
            <SaveTripCta onSave={onSaveTitle} disabled={isUpdatingTrip} />
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-destructive hover:bg-destructive/10 cursor-pointer transition-colors duration-200"
              onClick={onCancelEditTitle}
              disabled={isUpdatingTrip}
              aria-label={t("trip.cancelEdit")}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 min-w-0">
            <h1
              className="text-2xl md:text-3xl font-bold truncate capitalize"
              data-testid="trip-detail-title"
            >
              {tripTitleLocalized}
            </h1>
            <Button
              size="icon"
              variant="outline"
              className="h-9 w-9 shrink-0 cursor-pointer transition-colors duration-200 border-border"
              onClick={onStartEditTitle}
              title={t("trip.editTitle")}
              aria-label={t("trip.editTitle")}
            >
              <Edit2 className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        )}
      </div>

      <div className="shrink-0">{actions}</div>
    </div>
  );
}
