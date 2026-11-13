# UI/UX, i18n, state boundaries (`frontend/web`)

## Mandatory pre-flight before any UI change

Any layout, component, interaction, color, spacing or animation change must first run the `ui-ux-pro-max` skill:

```bash
python .claude/skills/ui-ux-pro-max/scripts/search.py "<description>" --design-system
```

Add `--domain ux "<pattern>"` for a specific interaction and `--stack shadcn`. Read `design-system/travelplan/MASTER.md` before rerunning `search.py` — that file was hand-tuned to the real tokens in `frontend/web/src/index.css`. `design-system/pages/<page>.md` (if present) overrides it for that page. The only correct skill path is `.claude/skills/ui-ux-pro-max/` (ignore `.agent/skills/…`, `.shared/…` in old docs).

## Conventions

- No action that appears only on hover — always provide an affordance in the resting state.
- Destructive actions (delete, cancel trip, cancel subscription) have a confirm dialog.
- `cursor-pointer` on clickable elements; hover/focus 150–300ms (`transition-colors duration-200`).
- SVG icons (Lucide), no emoji as icons.
- Contrast ≥ 4.5:1 in both light and dark; do not distinguish states by color alone.
- Responsive at 375 / 768 / 1024 / 1440, no horizontal overflow.
- No magic values like `w-[342px]` — use the Tailwind scale.
- Respect `prefers-reduced-motion`; a clear focus state when tabbing.

## State boundaries

| Kind of state | Use             | Notes                                       |
| ------------- | --------------- | ------------------------------------------- |
| Server        | TanStack Query  | Never put API data into Zustand             |
| Client/UI     | Zustand         | Small stores, per feature                   |
| URL           | React Router    | "Where am I" belongs to the URL             |
| Form          | React Hook Form | Do not lift to a global store before submit |

Job polling: exponential backoff 1s → at most 10s, showing progress as steps. Optimistic updates have a rollback + toast when the request fails.

## Render security

Bare `dangerouslySetInnerHTML` is forbidden. AI output: raw → `DOMPurify.sanitize()` → render (or `react-markdown`). Parse API responses through Zod before using them in a component.

## Mapbox

`React.lazy` for the map component; ≤ 50 raw markers at a time (use `supercluster`); `map.remove()` in the `useEffect` cleanup.

## i18n

Do not write strings directly in components — `const { t } = useTranslationStore()` (`frontend/web/src/stores/useTranslationStore.ts`). Every new string has all of English (US), French, Vietnamese (`useTranslationStore.test.ts` checks).

## `data-testid` for E2E

- `data-testid="<feature>-<component>-<element>"`, kebab-case, English, not derived from the displayed copy. Dynamic instances add an id: `trip-card-${tripId}`, `itinerary-day-${dayIndex}`.
- Stateful components (`JobStatusIndicator`, `JobStatusBadge`, `TripStatusBadge`, `AgentLockBanner`) also carry `data-status`/`data-state` with a machine value (`"COMPLETED"`), and tests assert on that instead of text.
- Do not add a testid when a stable handle already exists (`id`, `aria-label`).
- The literal is written directly in the component; the test-side mirror is in `e2e/support/testids.ts`.
- Adding only an attribute does not need the `ui-ux-pro-max` pre-flight.

## Where to put a component

Has business logic (e.g. checks job status itself) → `features/<domain>/components/`. Takes only props → shared `components/`.

## Related skills

`ui-ux-pro-max` (mandatory before UI changes), `ui-styling` (shadcn/Tailwind patterns), `itinerary-builder` (itinerary pipeline), `rag-destinations` (destinations module), `travelplan-devops` (Docker, CI, deploy).
