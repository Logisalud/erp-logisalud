import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        logisalud: {
          green: "#4BB168",
          teal: "#4ABCC2",
          dark: "#090d16",
          card: "#0f172a",
        },
      },
      fontFamily: {
        heading: ["Oswald", "system-ui", "sans-serif"],
        body: ["Poppins", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
