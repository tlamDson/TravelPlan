/**
 * Mirrors the `data-testid` literals used in frontend/web components (see
 * .claude/reference/ui-design.md's "data-testid cho E2E" convention). Kept
 * test-side only — components use inline string literals, not an import
 * from here, so product code never depends on test code.
 */
export const testIds = {
  wizard: "trip-wizard",
  wizardStepIndicator: "trip-wizard-step-indicator",
  wizardReset: "trip-wizard-reset",
  wizardBack: "trip-wizard-back",
  wizardNext: "trip-wizard-next",
  wizardCreate: "trip-wizard-create",
  wizardTitle: "trip-wizard-title",
  wizardStartDate: "trip-wizard-start-date",
  wizardEndDate: "trip-wizard-end-date",
  wizardCountry: "trip-wizard-country",
  wizardCity: "trip-wizard-city",
  countryOption: (idKey: string) => `country-option-${idKey}`,
  cityOption: (idKey: string) => `city-option-${idKey}`,
  wizardPace: (value: string) => `trip-wizard-pace-${value}`,
  wizardFocus: (value: string) => `trip-wizard-focus-${value}`,
  wizardAccommodation: (value: string) => `trip-wizard-accommodation-${value}`,
  wizardTransport: (value: string) => `trip-wizard-transport-${value}`,

  tripsNewTripButton: "trips-new-trip-button",
  tripCard: (tripId: string) => `trip-card-${tripId}`,

  jobStatus: "job-status",
  tripStatusBadge: "trip-status-badge",
  agentLockBanner: "agent-lock-banner",
  agentLockCancel: "agent-lock-cancel",
  backgroundProcessingModal: "background-processing-modal",
  backgroundProcessingDismiss: "background-processing-dismiss",
} as const;
