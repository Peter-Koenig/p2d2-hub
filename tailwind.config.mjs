// tailwind.config.mjs
import { fontFamily } from "tailwindcss/defaultTheme";
import typography from "@tailwindcss/typography";

export default {
  content: ["./src/**/*.{astro,js,ts,jsx,tsx,md,mdx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#eefff6",
          100: "#d7ffea",
          200: "#b2ffd6",
          300: "#79ffb9",
          400: "#3eff95",
          500: "#16f079",
          600: "#00cc5e",
          700: "#00a04d",
          800: "#007d40",
          900: "#006737",
        },
      },
      fontFamily: {
        poppins: ["Poppins", ...fontFamily.sans],
        inter: ["Inter", ...fontFamily.sans],
        sans: ["Inter", ...fontFamily.sans],
        display: ["Poppins", ...fontFamily.sans],
      },
      fontSize: {
        hero: "3.75rem", // 60px
        section: "2.25rem", // 36px
        base: "1.125rem", // 18px
        list: "1rem", // 16px
      },
      typography: ({ theme }) => ({
        DEFAULT: {
          css: {
            color: theme("colors.gray.800"),
            fontFamily: theme("fontFamily.inter").join(", "),
            fontSize: theme("fontSize.base"),
            lineHeight: "1.75",
            maxWidth: "80ch",
            h1: {
              fontFamily: theme("fontFamily.poppins").join(", "),
              fontWeight: "700",
              color: theme("colors.gray.900"),
              letterSpacing: theme("letterSpacing.tight"),
              fontSize: theme("fontSize.3xl"),
              marginTop: "1.5em",
              marginBottom: "0.5em",
            },
            h2: {
              fontFamily: theme("fontFamily.poppins").join(", "),
              fontWeight: "700",
              color: theme("colors.gray.900"),
              fontSize: theme("fontSize.2xl"),
              marginTop: "1.2em",
              marginBottom: "0.5em",
            },
            h3: {
              fontFamily: theme("fontFamily.poppins").join(", "),
              fontWeight: "600",
              color: theme("colors.gray.900"),
              fontSize: theme("fontSize.xl"),
              marginTop: "1em",
              marginBottom: "0.3em",
            },
            h4: {
              fontFamily: theme("fontFamily.poppins").join(", "),
              fontWeight: "600",
              color: theme("colors.gray.900"),
              fontSize: theme("fontSize.lg"),
            },
            strong: { color: theme("colors.gray.900") },
            a: {
              color: theme("colors.primary.700"),
              textDecoration: "underline",
              fontWeight: "500",
              transition: "color 0.2s",
              "&:hover": {
                color: theme("colors.primary.500"),
              },
            },
            blockquote: {
              borderLeftColor: theme("colors.primary.300"),
              color: theme("colors.gray.700"),
              fontStyle: "italic",
              backgroundColor: theme("colors.primary.50"),
              paddingLeft: "1em",
              paddingTop: "0.5em",
              paddingBottom: "0.5em",
              borderRadius: "0.375rem",
            },
            code: {
              color: theme("colors.pink.600"),
              backgroundColor: theme("colors.gray.100"),
              padding: "0.2em 0.4em",
              borderRadius: "0.25rem",
              fontSize: "0.95em",
            },
            pre: {
              color: theme("colors.gray.100"),
              backgroundColor: theme("colors.gray.800"),
              borderRadius: "0.375rem",
              padding: "1em",
            },
            ul: {
              paddingLeft: "1.5em",
              marginTop: "0.5em",
              marginBottom: "0.5em",
            },
            ol: {
              paddingLeft: "1.5em",
              marginTop: "0.5em",
              marginBottom: "0.5em",
            },
            li: {
              marginTop: "0.25em",
              marginBottom: "0.25em",
            },
            table: {
              marginTop: "1em",
              marginBottom: "1em",
            },
            th: {
              backgroundColor: theme("colors.primary.100"),
              color: theme("colors.gray.900"),
              fontWeight: "600",
            },
            tr: {
              borderBottomColor: theme("colors.gray.200"),
            },
          },
        },
      }),
    },
  },
  plugins: [typography],
};
