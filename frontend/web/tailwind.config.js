/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      colors: {
        background: {
          DEFAULT: "hsl(var(--background))",
          secondary: "hsl(var(--background-secondary))",
          card: "hsl(var(--background-card))",
        },
        foreground: {
          DEFAULT: "hsl(var(--foreground))",
          secondary: "hsl(var(--foreground-secondary))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        "accent-blue": {
          DEFAULT: "hsl(var(--accent-blue))",
          hover: "hsl(var(--accent-blue-hover))",
          active: "hsl(var(--accent-blue-active))",
        },
        "accent-red": "hsl(var(--accent-red))",
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        ui: {
          hover: "hsl(var(--ui-hover))",
          active: "hsl(var(--ui-active))",
        },
        icon: {
          DEFAULT: "hsl(var(--icon))",
          secondary: "hsl(var(--icon-secondary))",
        },
        scrollbar: {
          thumb: "hsl(var(--scrollbar-thumb))",
          "thumb-hover": "hsl(var(--scrollbar-thumb-hover))",
        },
        chart: {
          1: "hsl(var(--chart-1))",
          2: "hsl(var(--chart-2))",
          3: "hsl(var(--chart-3))",
          4: "hsl(var(--chart-4))",
          5: "hsl(var(--chart-5))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          border: "hsl(var(--sidebar-border))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          ring: "hsl(var(--sidebar-ring))",
        },
        tag: {
          gray: "hsl(var(--tag-gray))",
          "gray-text": "hsl(var(--tag-gray-text))",
          brown: "hsl(var(--tag-brown))",
          "brown-text": "hsl(var(--tag-brown-text))",
          orange: "hsl(var(--tag-orange))",
          "orange-text": "hsl(var(--tag-orange-text))",
          yellow: "hsl(var(--tag-yellow))",
          "yellow-text": "hsl(var(--tag-yellow-text))",
          green: "hsl(var(--tag-green))",
          "green-text": "hsl(var(--tag-green-text))",
          blue: "hsl(var(--tag-blue))",
          "blue-text": "hsl(var(--tag-blue-text))",
          purple: "hsl(var(--tag-purple))",
          "purple-text": "hsl(var(--tag-purple-text))",
          pink: "hsl(var(--tag-pink))",
          "pink-text": "hsl(var(--tag-pink-text))",
          red: "hsl(var(--tag-red))",
          "red-text": "hsl(var(--tag-red-text))",
        },
        callout: {
          gray: "hsl(var(--callout-gray))",
          green: "hsl(var(--callout-green))",
          blue: "hsl(var(--callout-blue))",
          yellow: "hsl(var(--callout-yellow))",
          orange: "hsl(var(--callout-orange))",
          red: "hsl(var(--callout-red))",
          purple: "hsl(var(--callout-purple))",
          pink: "hsl(var(--callout-pink))",
        },
        code: {
          "inline-text": "hsl(var(--code-inline-text))",
          "inline-bg": "hsl(var(--code-inline-bg))",
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
