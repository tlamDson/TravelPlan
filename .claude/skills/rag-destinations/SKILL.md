---
name: rag-destinations
description: Dùng khi sửa module destinations của TravelPlan — backend/src/features/destinations/**, world destinations list, embedding, insight scraping, Country/PlaceInsight model, hoặc frontend/web wizard destination picker. Đây là module đang có thay đổi dở dang, kiểm git status trước khi bắt đầu.
---

# RAG Destinations Pipeline

Chuyển từ 3 nước hardcode sang danh sách 25+ nước lấy từ DB, kèm pipeline scrape insight qua Serper API + BullMQ rồi inject vào RAG prompt cho trip generation. Tài liệu gốc: `docs/implementation/rag-destinations-pipeline.md`.

## ⚠️ Module đang có WIP

Kiểm `git status` trước khi động vào file trong `backend/src/features/destinations/` hoặc `frontend/web/src/features/planner/components/wizard/WizardDestinationPickers.tsx` — có thể đang có thay đổi chưa commit của người dùng. Không ghi đè mà không hỏi trước.

## Cấu trúc thật (đã đối chiếu code)

```
backend/src/features/destinations/
├── controllers/destination.controller.ts
├── routes.ts
├── models/Country.ts, PlaceInsight.ts
├── jobs/insight-queue.ts, insight-worker.ts       # BullMQ scrape pipeline
└── services/
    ├── world-destinations.builder.ts               # đang WIP
    ├── destination-list.service.ts
    ├── destination-list.mappers.ts    (+ .test.ts)
    ├── destination-list.merge.ts      (+ .test.ts)
    ├── destination-world-invariants.test.ts
    ├── destination-lookup.service.ts
    ├── embedding.service.ts
    ├── insight-scraper.service.ts
    └── place-insight-retrieval.service.ts
```

**Đây là module duy nhất trong backend có test** (3 file `.test.ts` liệt kê ở trên) — dùng làm pattern tham khảo khi viết test mới cho module khác.

## Lệnh liên quan

```bash
npm run seed:destinations -w backend    # tsx scripts/seed-destinations.ts
```

## Ghi chú kiến trúc

- Serper API dùng để search insight cho từng destination, chạy qua BullMQ (`insight-queue.ts` enqueue, `insight-worker.ts` xử lý) — không gọi Serper đồng bộ trong request path.
- Embedding (`embedding.service.ts`) phục vụ RAG retrieval khi generate trip — kết quả được inject vào prompt AI, không phải AI tự nhớ.
- Khi sửa `world-destinations.builder.ts` hoặc `destination-list.merge.ts`, chạy lại 3 test hiện có trước — chúng bảo vệ đúng phần invariant dễ vỡ nhất (danh sách nước không trùng, không thiếu field bắt buộc).
- Tuân theo thứ tự thay đổi chéo lớp (`CLAUDE.md` mục Shared Kernel): nếu đổi shape dữ liệu trả về cho frontend, kiểm `packages/shared` trước, rồi `frontend/web/src/features/planner/components/wizard/WizardDestinationPickers.tsx` và `frontend/web/src/features/planner/utils/destination-parser.ts`.
