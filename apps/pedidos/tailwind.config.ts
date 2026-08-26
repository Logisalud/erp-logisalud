import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./features/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        logisalud: {
          green: "#4BB168",
          teal: "#4ABCC2",
        },
      },
      fontFamily: {
        heading: ["var(--font-oswald)"],
        body: ["var(--font-poppins)"],
      },
    },
  },
  plugins: [],
};
export default config;
