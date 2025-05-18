import { fontFamily } from "tailwindcss/defaultTheme";

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
      },
      fontSize: {
        hero: "3.75rem", // 60px
        section: "2.25rem", // 36px
        base: "1.125rem", // 18px
        list: "1rem", // 16px
      },
    },
  },
  plugins: [],
};
