# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** TravelPlan
**Generated:** 2026-09-12 18:26:10 (search.py --design-system --persist), hand-adjusted the same day to match the real tokens
**Category:** Travel/Tourism Agency (library classification — only correct for the landing/marketing part, see the note under "Style Guidelines")

**Read before use:** Colors are overridden with the real tokens (`frontend/web/src/index.css`), not the original library palette. Component Specs + Style Guidelines are adjusted to separate the real app area (Minimalism/shadcn) from the landing area (`features/landing/`, keeps the gradient accent, drops the video hero).

---

## Global Rules

### Color Palette — Ground truth: `frontend/web/src/index.css` (do NOT use the library's closest approximation)

⚠️ The original library palette (`#0EA5E9` sky blue + `#EA580C` adventure orange, category "Travel/Tourism Agency") is only the closest suggestion in the lookup data — **it does not match the real tokens running in the app**. The table below is taken directly from the CSS variables (`hsl(...)` → hex) actually used in `frontend/web/src/index.css`; that is the source of truth when building UI.

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
| Primary / Ring                           | `#24A8E5` | unchanged between light/dark                                 |
| Destructive                              | `#E94444` | unchanged between light/dark                                 |
| Background                               | `#0D0D0D` | `--background`                                               |
| Background secondary / Card / Sidebar bg | `#000000` | `--background-secondary` / `--card` / `--sidebar-background` |
| Secondary / Muted / Accent (bg)          | `#242424` | `--secondary` / `--muted` / `--accent`                       |
| Foreground                               | `#FFFFFF` | `--foreground`                                               |
| Foreground secondary                     | `#E3E3E3` | `--foreground-secondary`                                     |

**Color Notes:** Warm-neutral sky-blue accent (hue 199°, similar to the library's "Sky Blue" family but with different saturation/lightness) on a warm cream background (light) / near-black (dark), with warm text contrast (charcoal brown `#362F2B`, not cool gray). Global radius `0.5rem` (`--radius`). For the tag/callout colors (gray/brown/orange/yellow/green/blue/purple/pink/red) see `index.css` — not repeated here because the CSS constants already exist; do not create new values that duplicate their purpose.

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

Already aligned with `--radius: 0.5rem` (8px) and the real tokens in `index.css` — do not use the original library's orange `#EA580C` / light-blue background `#F0F9FF`; the project has no separate orange CTA color, the primary action uses sky-blue directly.

### Buttons

```css
/* Primary Button — same as shadcn Button variant="default", already available in components/ui/button.tsx */
.btn-primary {
  background: hsl(var(--primary)); /* #24A8E5 light, unchanged in dark */
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

⚠️ The original library suggests "Aurora UI" (vivid gradient, Northern Lights) + a "Video-First Hero" pattern for the "Travel/Tourism Agency" category — this is a suggestion for a **travel marketing/advertising page**, not a full match for TravelPlan (an agentic travel _planner_ app, not a tourism agency selling tours). Apply it selectively across 2 areas:

**Real app area (after login — wizard, trip detail, dashboard, `/reliability`, etc.):** ignore the whole Style/Page Pattern section below. Follow plain `shadcn`/Minimalism — flat, few shadows, no decorative gradients, exactly as in the current `frontend/web/src/components/ui/`. Only apply the Spacing/Shadow tokens + Anti-patterns + Checklist above.

**Landing/marketing area (`frontend/web/src/features/landing/`, already exists — `HeroSection`/`FeaturesSection`/`HowItWorksSection`/`TestimonialsSection`/`CTASection`):** keep the "gradient accent" part of Aurora UI (already matching the existing `.gradient-text`/`.accent-glow` utilities in `index.css`, using `--primary` + `--accent-blue`) but **drop the "Video-First Hero"** — the real landing page does not use a video background, only static images/gradients. The real section order already follows the standard "Hero + Features + How It Works + Testimonials + CTA" pattern, no change needed.

**Style:** Minimalism (app) / Static gradient accent, no video (landing)

**Keywords that still apply:** smooth blend, luminous accent glow — kept through the existing `gradient-text`/`accent-glow` utilities; **drop** "mesh gradient"/"Northern Lights"/"abstract" (they do not match the current clean style).

**Key Effects:** `hover-lift` (translateY -4px), `accent-glow` (box-shadow glow around primary), `gradient-text` (primary → accent-blue) — all 3 already exist in `index.css`, reuse them instead of creating new effects.

### Page Pattern (applies only to `features/landing/`)

**Pattern Name:** Hero + Features + How It Works + Testimonials + CTA (already correct, matches the current `LandingPage.tsx`)

- **CTA Placement:** `CTASection` at the bottom of the page + CTA inside `HeroSection` — no overlay on video.
- **Section Order:** the exact order of the existing files: `LandingNav` → `HeroSection` → `FeaturesSection` → `HowItWorksSection` → `TestimonialsSection` → `CTASection` → `LandingFooter`.

---

## Anti-Patterns (Do NOT Use)

- ❌ Generic photos
- ❌ Complex booking
- ❌ Video background hero (the library suggests "Video-First Hero" — the real landing page currently does NOT use video, keep the static gradient/images)
- ❌ Vivid mesh gradient/Aurora beyond the existing `gradient-text`/`accent-glow` — the real app area (post-login) must stay flat, with no decorative gradients

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
