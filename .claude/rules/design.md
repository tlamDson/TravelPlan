# Design — UI/UX, i18n, state boundaries

## UI/UX Pro Max Pre-flight — BẮT BUỘC

Trước khi áp dụng **BẤT KỲ** thay đổi UI nào ở `frontend/web` — layout, component, interaction, màu, spacing, hay animation — phải chạy skill `ui-ux-pro-max` trước:

```bash
python .claude/skills/ui-ux-pro-max/scripts/search.py "<mô tả>" --design-system
```

Luôn bắt đầu bằng `--design-system`, rồi bổ sung `--domain ux "<pattern>"` cho interaction cụ thể, `--stack shadcn` vì TravelPlan dùng shadcn/ui.

Design system đã sinh sẵn cho TravelPlan (`--persist`) nằm ở `design-system/travelplan/MASTER.md` — đọc file này **trước** khi chạy lại `search.py`, nó đã được hiệu chỉnh tay để khớp token thật ở `frontend/web/src/index.css` (bảng màu library gốc trong dữ liệu tra cứu chỉ là gợi ý gần nhất, không phải nguồn sự thật). `design-system/pages/<tên-trang>.md` (nếu có) override `MASTER.md` cho đúng trang đó.

⚠️ Có nhiều đường dẫn cũ mâu thuẫn còn sót trong repo (`docs/agents/frontend.md` ghi `.agent/skills/...`, `.github/prompts/` ghi `.shared/...`) — đường dẫn đúng duy nhất kể từ giờ là `.claude/skills/ui-ux-pro-max/`.

## Quy ước không thương lượng

- Không bao giờ để action chỉ hiện khi hover (`group-hover:opacity-100`) — luôn có affordance ở trạng thái nghỉ.
- Action phá huỷ (xoá, huỷ trip, huỷ subscription) phải có confirm dialog.
- Luôn `cursor-pointer` trên phần tử click được.
- Feedback hover/focus 150–300ms (`transition-colors duration-200`) — không tức thì, không >500ms.
- Icon là SVG (Lucide) — **không dùng emoji làm icon**.
- Contrast tối thiểu 4.5:1 ở cả light lẫn dark theme.
- Test responsive ở 375 / 768 / 1024 / 1440.
- Không magic value kiểu `w-[342px]` — dùng token/scale có sẵn của Tailwind.
- Tôn trọng `prefers-reduced-motion`.

## State boundaries

| Loại state      | Dùng gì         | Ghi chú                                           |
| --------------- | --------------- | ------------------------------------------------- |
| Server state    | TanStack Query  | **Không bao giờ** nhét data API vào Zustand store |
| Client/UI state | Zustand         | Store nhỏ, atomic, theo từng feature              |
| URL state       | React Router    | Nếu nó định nghĩa "tôi đang ở đâu" → thuộc về URL |
| Form state      | React Hook Form | Không đẩy lên global store trước khi submit       |

## Polling & optimistic UI

Polling trạng thái job dùng exponential backoff: bắt đầu 1s, gấp đôi tới tối đa 10s. Hiển thị tiến độ dạng bước (`Thinking → Fetching Maps → Verifying Prices`), không chỉ progress bar trần. Optimistic update phải có rollback + toast khi request thật fail.

## Bảo mật render

Cấm `dangerouslySetInnerHTML` trực tiếp. Pipeline bắt buộc cho output AI: raw text → `DOMPurify.sanitize()` → render (hoặc `react-markdown`). Mọi response từ API phải parse qua Zod schema trước khi dùng trong component.

## Mapbox

`React.lazy` cho component bản đồ. Không quá 50 raw marker cùng lúc — dùng `supercluster`. Gọi `map.remove()` trong cleanup của `useEffect` để tránh leak.

## i18n

Không viết chuỗi text thẳng trong component. Luôn lấy qua `const { t } = useTranslationStore()` (`frontend/web/src/stores/useTranslationStore.ts`). Mỗi chuỗi mới phải thêm đủ **cả 3 ngôn ngữ** đang hỗ trợ: English (US), French, Vietnamese.

## `data-testid` cho E2E (Playwright)

Thêm từ PR `chore/e2e-testids` để lớp E2E Playwright (đang dựng, xem `.claude/rules/tech-defaults.md` mục "Hạ tầng test") không phải bám text đã qua i18n (3 ngôn ngữ) hay đoán tên class Tailwind.

- Quy ước: `data-testid="<feature>-<component>-<element>"`, kebab-case, tiếng Anh, **không bao giờ** lấy từ copy hiển thị. Instance động thêm hậu tố id thật: `trip-card-${tripId}`, `itinerary-day-${dayIndex}`, `itinerary-activity-${activityId}`.
- **Component mang trạng thái** (`JobStatusIndicator`, `JobStatusBadge`, `TripStatusBadge`, `AgentLockBanner`) đi kèm `data-status`/`data-state` chứa giá trị máy (`"COMPLETED"`, không phải `"Completed"`/`"Đã hủy"`) — để test đổi locale mà không phải sửa assertion. Ưu tiên assert theo `data-status`, không assert theo text hiển thị, khi cả hai đều có sẵn.
- **Không thêm testid ở nơi đã có handle accessible tốt** (`id`, `aria-label` ổn định) — vd `id="title"`, `aria-label="Start date"`, radio `id="transport-car"`. Chỉ thêm khi thật sự không có cách chạm ổn định qua locale (điển hình: item cmdk/Command trong destination picker, nút hành động không có label cố định).
- Literal `data-testid` viết thẳng trong component (không import hằng số từ module dùng chung) — bản mirror phía test sống ở `e2e/support/testids.ts`, tách biệt code sản phẩm khỏi code test.
- Đây chỉ là thêm attribute, **không** đổi layout/màu/spacing/interaction → không thuộc phạm vi bắt buộc chạy skill `ui-ux-pro-max`.

## Component vs feature

Component có business logic (vd: tự kiểm tra job status) → đặt trong `features/<domain>/components/`. Component chỉ nhận props, không tự biết gì về domain → đặt trong `components/` dùng chung.

## Checklist pre-delivery cho mọi UI

- [ ] Contrast 4.5:1 cả light/dark
- [ ] Responsive ở 375/768/1024/1440, không tràn ngang
- [ ] Alt text cho ảnh, label cho form field
- [ ] Không chỉ dùng màu để phân biệt trạng thái (kèm icon/text)
- [ ] `prefers-reduced-motion` được tôn trọng
- [ ] Focus state hiện rõ khi tab bằng bàn phím
- [ ] Chuỗi text mới đã có ở cả 3 ngôn ngữ

## Skills có sẵn (`.claude/skills/`)

| Skill               | Dùng khi                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------- |
| `ui-ux-pro-max`     | Bất kỳ thay đổi UI nào — bắt buộc chạy trước                                              |
| `ui-styling`        | Cần tra cứu pattern shadcn/Tailwind cụ thể (theming, accessibility, responsive utilities) |
| `itinerary-builder` | Đụng vào pipeline sinh lịch trình (backend, nhưng ảnh hưởng UI hiển thị)                  |
| `rag-destinations`  | Đụng vào module destinations/world list                                                   |
| `travelplan-devops` | Dockerfile, GitHub Actions, railway/render/vercel config                                  |
