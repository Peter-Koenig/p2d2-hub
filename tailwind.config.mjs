import { fontFamily } from "tailwindcss/defaultTheme";

export default {
  content: ["./src/**/*.{astro,js,ts,jsx,tsx,md,mdx}"],
  theme: {
    extend: {
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
