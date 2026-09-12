# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** TravelPlan
**Generated:** 2026-09-12 18:26:10 (search.py --design-system --persist), hiệu chỉnh tay cùng ngày để khớp token thật
**Category:** Travel/Tourism Agency (library classification — chỉ đúng cho phần landing/marketing, xem ghi chú ở "Style Guidelines")

**Đọc trước khi dùng:** Colors đã ghi đè bằng token thật (`frontend/web/src/index.css`), không phải bảng màu library gốc. Component Specs + Style Guidelines đã hiệu chỉnh để phân biệt vùng app thật (Minimalism/shadcn) và vùng landing (`features/landing/`, giữ gradient-accent, bỏ video-hero).

---

## Global Rules

### Color Palette — Ground truth: `frontend/web/src/index.css` (KHÔNG lấy từ library gần đúng nhất)

⚠️ Bảng màu library gốc (`#0EA5E9` sky blue + `#EA580C` adventure orange, category "Travel/Tourism Agency") chỉ là gợi ý gần nhất trong dữ liệu tra cứu — **không khớp token thật đang chạy trong app**. Bảng dưới đây lấy trực tiếp từ CSS variables (`hsl(...)` → hex) đang dùng thật ở `frontend/web/src/index.css`, đây mới là nguồn sự thật khi build UI.

**Light mode:**

| Role                              | Hex       | CSS Variable (`index.css`)                        |
| --------------------------------- | --------- | ------------------------------------------------- |
| Primary / Ring / Sidebar Primary  | `#24A8E5` | `--primary` / `--ring` / `--accent-blue`          |
| Primary hover                     | `#068DCB` | `--accent-blue-hover`                             |
| Primary active                    | `#0081BD` | `--accent-blue-active`                            |
| Destructive                       | `#E94444` | `--destructive` / `--accent-red`                  |
| Background                        | `#FFFFFF` | `--background` / `--card` / `--popover`           |
| Background secondary / Sidebar bg | `#FBFAF9` | `--background-secondary` / `--sidebar-background` |
| Secondary / Muted / Accent (bg)   | `#F7F5F3` | `--secondary` / `--muted` / `--accent`            |
| Border / Input                    | `#F0EEEB` | `--border` / `--input`                            |
| Foreground                        | `#362F2B` | `--foreground` / `--card-foreground`              |
| Muted foreground                  | `#969C9A` | `--muted-foreground`                              |

**Dark mode:**

| Role                                     | Hex       | CSS Variable (`index.css`)                                   |
| ----------------------------------------- | --------- | ------------------------------------------------------------ |
| Primary / Ring                           | `#24A8E5` | không đổi giữa light/dark                                    |
| Destructive                              | `#E94444` | không đổi giữa light/dark                                    |
| Background                               | `#0D0D0D` | `--background`                                               |
| Background secondary / Card / Sidebar bg | `#000000` | `--background-secondary` / `--card` / `--sidebar-background` |
| Secondary / Muted / Accent (bg)          | `#242424` | `--secondary` / `--muted` / `--accent`                       |
| Foreground                               | `#FFFFFF` | `--foreground`                                               |
| Foreground secondary                     | `#E3E3E3` | `--foreground-secondary`                                     |

**Color Notes:** Warm-neutral sky-blue accent (hue 199°, giống họ màu "Sky Blue" của library nhưng độ bão hoà/độ sáng khác) trên nền cream ấm (light) / gần đen (dark), tương phản chữ ấm (nâu than `#362F2B`, không phải xám lạnh). Radius toàn cục `0.5rem` (`--radius`). Tag/callout colors (gray/brown/orange/yellow/green/blue/purple/pink/red) xem đầy đủ ở `index.css` — không lặp lại ở đây vì đã có sẵn hằng số CSS, đừng tạo giá trị mới trùng mục đích.

### Typography

- **Heading Font:** Outfit
- **Body Font:** Work Sans
- **Mood:** geometric, modern, clean, balanced, contemporary, versatile
- **Google Fonts:** [Outfit + Work Sans](https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Work+Sans:wght@300;400;500;600;700&display=swap)

**CSS Import:**

```css
@import url("https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Work+Sans:wght@300;400;500;600;700&display=swap");
```

### Spacing Variables

| Token         | Value             | Usage                     |
| ------------- | ----------------- | ------------------------- |
| `--space-xs`  | `4px` / `0.25rem` | Tight gaps                |
| `--space-sm`  | `8px` / `0.5rem`  | Icon gaps, inline spacing |
| `--space-md`  | `16px` / `1rem`   | Standard padding          |
| `--space-lg`  | `24px` / `1.5rem` | Section padding           |
| `--space-xl`  | `32px` / `2rem`   | Large gaps                |
| `--space-2xl` | `48px` / `3rem`   | Section margins           |
| `--space-3xl` | `64px` / `4rem`   | Hero padding              |

### Shadow Depths

| Level         | Value                          | Usage                       |
| ------------- | ------------------------------- | ---------------------------- |
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)`   | Subtle lift                 |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.1)`    | Cards, buttons              |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)`  | Modals, dropdowns           |
| `--shadow-xl` | `0 20px 25px rgba(0,0,0,0.15)` | Hero images, featured cards |

---

## Component Specs

Đã khớp sẵn với `--radius: 0.5rem` (8px) và token thật ở `index.css` — không dùng cam `#EA580C`/nền xanh nhạt `#F0F9FF` của library gốc, project không có màu CTA cam riêng, primary action dùng thẳng sky-blue.

### Buttons

```css
/* Primary Button — trùng Button variant="default" của shadcn, đã có sẵn ở components/ui/button.tsx */
.btn-primary {
  background: hsl(var(--primary)); /* #24A8E5 light, không đổi ở dark */
  color: hsl(var(--primary-foreground)); /* #FFFFFF */
  padding: 12px 24px;
  border-radius: 8px; /* var(--radius) */
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}

.btn-primary:hover {
  background: hsl(var(--accent-blue-hover)); /* #068DCB */
}

.btn-primary:active {
  background: hsl(var(--accent-blue-active)); /* #0081BD */
}

/* Secondary/Outline Button — variant="outline" */
.btn-secondary {
  background: transparent;
  color: hsl(var(--primary));
  border: 2px solid hsl(var(--primary));
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}
```

### Cards

```css
.card {
  background: hsl(var(--card)); /* #FFFFFF light / #000000 dark */
  border: 1px solid hsl(var(--border)); /* #F0EEEB light */
  border-radius: 12px;
  padding: 24px;
  box-shadow: var(--shadow-md);
  transition: all 200ms ease;
}

.card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}
```

### Inputs

```css
.input {
  padding: 12px 16px;
  border: 1px solid hsl(var(--input)); /* #F0EEEB light */
  border-radius: 8px;
  font-size: 16px;
  transition: border-color 200ms ease;
}

.input:focus {
  border-color: hsl(var(--ring)); /* #24A8E5 */
  outline: none;
  box-shadow: 0 0 0 3px hsl(var(--ring) / 0.2);
}
```

### Modals

```css
.modal-overlay {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.modal {
  background: white;
  border-radius: 16px;
  padding: 32px;
  box-shadow: var(--shadow-xl);
  max-width: 500px;
  width: 90%;
}
```

---

## Style Guidelines

⚠️ Library gốc gợi ý "Aurora UI" (gradient rực rỡ, Northern Lights) + pattern "Video-First Hero" cho category "Travel/Tourism Agency" — đây là gợi ý cho trang **marketing/quảng cáo du lịch**, không khớp hoàn toàn với TravelPlan (agentic travel _planner_ app, không phải tourism agency bán tour). Áp dụng có chọn lọc theo 2 vùng:

**Vùng app thật (sau login — wizard, trip detail, dashboard, `/reliability`, v.v.):** bỏ qua toàn bộ mục Style/Page Pattern bên dưới. Theo `shadcn`/Minimalism thuần — flat, ít shadow, không gradient trang trí, đúng như `frontend/web/src/components/ui/` hiện có. Chỉ áp dụng Spacing/Shadow tokens + Anti-patterns + Checklist ở trên.

**Vùng landing/marketing (`frontend/web/src/features/landing/`, đã tồn tại — `HeroSection`/`FeaturesSection`/`HowItWorksSection`/`TestimonialsSection`/`CTASection`):** giữ lại phần "gradient accent" của Aurora UI (đã khớp sẵn với `.gradient-text`/`.accent-glow` utility có sẵn trong `index.css`, dùng `--primary` + `--accent-blue`) nhưng **bỏ "Video-First Hero"** — trang landing thật không dùng video nền, chỉ dùng ảnh/gradient tĩnh. Section order thật đã đúng pattern chuẩn "Hero + Features + How It Works + Testimonials + CTA", không cần đổi.

**Style:** Minimalism (app) / Gradient-accent tĩnh, không video (landing)

**Keywords còn áp dụng được:** smooth blend, luminous accent glow — giữ nguyên qua `gradient-text`/`accent-glow` utility sẵn có; **bỏ** "mesh gradient"/"Northern Lights"/"abstract" (không khớp phong cách sạch hiện tại).

**Key Effects:** `hover-lift` (translateY -4px), `accent-glow` (box-shadow glow quanh primary), `gradient-text` (primary → accent-blue) — cả 3 đã có sẵn trong `index.css`, dùng lại thay vì tạo effect mới.

### Page Pattern (chỉ áp dụng cho `features/landing/`)

**Pattern Name:** Hero + Features + How It Works + Testimonials + CTA (đã đúng, khớp `LandingPage.tsx` hiện tại)

- **CTA Placement:** `CTASection` cuối trang + CTA trong `HeroSection` — không overlay trên video.
- **Section Order:** đúng thứ tự file hiện có: `LandingNav` → `HeroSection` → `FeaturesSection` → `HowItWorksSection` → `TestimonialsSection` → `CTASection` → `LandingFooter`.

---

## Anti-Patterns (Do NOT Use)

- ❌ Generic photos
- ❌ Complex booking
- ❌ Video background hero (library gợi ý "Video-First Hero" — landing thật hiện tại KHÔNG dùng video, giữ nguyên gradient/ảnh tĩnh)
- ❌ Mesh gradient/Aurora rực rỡ ngoài phạm vi `gradient-text`/`accent-glow` đã có — vùng app thật (post-login) phải phẳng, không gradient trang trí

### Additional Forbidden Patterns

- ❌ **Emojis as icons** — Use SVG icons (Heroicons, Lucide, Simple Icons)
- ❌ **Missing cursor:pointer** — All clickable elements must have cursor:pointer
- ❌ **Layout-shifting hovers** — Avoid scale transforms that shift layout
- ❌ **Low contrast text** — Maintain 4.5:1 minimum contrast ratio
- ❌ **Instant state changes** — Always use transitions (150-300ms)
- ❌ **Invisible focus states** — Focus states must be visible for a11y

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent icon set (Heroicons/Lucide)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] No content hidden behind fixed navbars
- [ ] No horizontal scroll on mobile
