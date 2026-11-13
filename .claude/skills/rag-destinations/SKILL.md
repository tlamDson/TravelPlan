---
name: rag-destinations
description: Use when changing TravelPlan's destinations module — backend/src/features/destinations/**, world destinations list, embedding, insight scraping, Country/PlaceInsight model, or the frontend/web wizard destination picker. This module has unfinished changes in flight; check git status before starting.
---

# RAG Destinations Pipeline

Moves from 3 hardcoded countries to a list of 25+ countries loaded from the DB, with a pipeline that scrapes insights through the Serper API + BullMQ and injects them into the RAG prompt for trip generation. Source document: `docs/implementation/rag-destinations-pipeline.md`.

## ⚠️ This module has WIP

Check `git status` before touching files in `backend/src/features/destinations/` or `frontend/web/src/features/planner/components/wizard/WizardDestinationPickers.tsx` — the user may have uncommitted changes. Do not overwrite them without asking first.

## Actual structure (checked against the code)

```
backend/src/features/destinations/
├── controllers/destination.controller.ts
├── routes.ts
├── models/Country.ts, PlaceInsight.ts
├── jobs/insight-queue.ts, insight-worker.ts       # BullMQ scrape pipeline
└── services/
    ├── world-destinations.builder.ts               # WIP
    ├── destination-list.service.ts
    ├── destination-list.mappers.ts    (+ .test.ts)
    ├── destination-list.merge.ts      (+ .test.ts)
    ├── destination-world-invariants.test.ts
    ├── destination-lookup.service.ts
    ├── embedding.service.ts
    ├── insight-scraper.service.ts
    └── place-insight-retrieval.service.ts
```

**This is the only module in the backend with tests** (the 3 `.test.ts` files listed above) — use it as the reference pattern when writing new tests for other modules.

## Related commands

```bash
npm run seed:destinations -w backend    # tsx scripts/seed-destinations.ts
```

## Architecture notes

- The Serper API is used to search insights for each destination, running through BullMQ (`insight-queue.ts` enqueues, `insight-worker.ts` processes) — never call Serper synchronously in the request path.
- Embedding (`embedding.service.ts`) supports RAG retrieval during trip generation — the results are injected into the AI prompt, the AI does not remember them on its own.
- When changing `world-destinations.builder.ts` or `destination-list.merge.ts`, rerun the 3 existing tests first — they guard exactly the most fragile invariants (the country list has no duplicates and no missing required fields).
- Follow the cross-layer change order (`CLAUDE.md`, Shared Kernel section): if you change the shape of the data returned to the frontend, check `packages/shared` first, then `frontend/web/src/features/planner/components/wizard/WizardDestinationPickers.tsx` and `frontend/web/src/features/planner/utils/destination-parser.ts`.
