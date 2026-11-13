# UI/UX, i18n, state boundaries (`frontend/web`)

## Pre-flight bắt buộc trước mọi thay đổi UI

Layout, component, interaction, màu, spacing hay animation đều phải chạy skill `ui-ux-pro-max` trước:

```bash
python .claude/skills/ui-ux-pro-max/scripts/search.py "<mô tả>" --design-system
```

Bổ sung `--domain ux "<pattern>"` cho interaction cụ thể và `--stack shadcn`. Đọc `design-system/travelplan/MASTER.md` trước khi chạy lại `search.py` — file này đã hiệu chỉnh tay theo token thật ở `frontend/web/src/index.css`. `design-system/pages/<trang>.md` (nếu có) override cho trang đó. Đường dẫn skill đúng duy nhất là `.claude/skills/ui-ux-pro-max/` (bỏ qua `.agent/skills/…`, `.shared/…` trong tài liệu cũ).

## Quy ước

- Không action chỉ hiện khi hover — luôn có affordance ở trạng thái nghỉ.
- Action phá huỷ (xoá, huỷ trip, huỷ subscription) có confirm dialog.
- `cursor-pointer` trên phần tử click được; hover/focus 150–300ms (`transition-colors duration-200`).
- Icon SVG (Lucide), không emoji làm icon.
- Contrast ≥ 4.5:1 cả light lẫn dark; không chỉ dùng màu để phân biệt trạng thái.
- Responsive 375 / 768 / 1024 / 1440, không tràn ngang.
- Không magic value kiểu `w-[342px]` — dùng scale Tailwind.
- Tôn trọng `prefers-reduced-motion`; focus state rõ khi tab.

## State boundaries

| Loại state | Dùng            | Ghi chú                                 |
| ---------- | --------------- | --------------------------------------- |
| Server     | TanStack Query  | Không bao giờ nhét data API vào Zustand |
| Client/UI  | Zustand         | Store nhỏ, theo feature                 |
| URL        | React Router    | "Tôi đang ở đâu" thuộc về URL           |
| Form       | React Hook Form | Không đẩy lên global store trước submit |

Polling job: exponential backoff 1s → tối đa 10s, hiển thị tiến độ dạng bước. Optimistic update có rollback + toast khi request fail.

## Bảo mật render

Cấm `dangerouslySetInnerHTML` trần. Output AI: raw → `DOMPurify.sanitize()` → render (hoặc `react-markdown`). Response API parse qua Zod trước khi dùng trong component.

## Mapbox

`React.lazy` cho component bản đồ; ≤ 50 marker thô cùng lúc (dùng `supercluster`); `map.remove()` trong cleanup của `useEffect`.

## i18n

Không viết chuỗi thẳng trong component — `const { t } = useTranslationStore()` (`frontend/web/src/stores/useTranslationStore.ts`). Mỗi chuỗi mới có đủ English (US), French, Vietnamese (`useTranslationStore.test.ts` kiểm).

## `data-testid` cho E2E

- `data-testid="<feature>-<component>-<element>"`, kebab-case, tiếng Anh, không lấy từ copy hiển thị. Instance động thêm id: `trip-card-${tripId}`, `itinerary-day-${dayIndex}`.
- Component mang trạng thái (`JobStatusIndicator`, `JobStatusBadge`, `TripStatusBadge`, `AgentLockBanner`) kèm `data-status`/`data-state` là giá trị máy (`"COMPLETED"`), test assert theo đó thay vì text.
- Không thêm testid khi đã có handle ổn định (`id`, `aria-label`).
- Literal viết thẳng trong component; bản mirror phía test ở `e2e/support/testids.ts`.
- Chỉ thêm attribute thì không cần pre-flight `ui-ux-pro-max`.

## Đặt component

Có business logic (vd tự kiểm job status) → `features/<domain>/components/`. Chỉ nhận props → `components/` dùng chung.

## Skills liên quan

`ui-ux-pro-max` (bắt buộc trước thay đổi UI), `ui-styling` (pattern shadcn/Tailwind), `itinerary-builder` (pipeline lịch trình), `rag-destinations` (module destinations), `travelplan-devops` (Docker, CI, deploy).
