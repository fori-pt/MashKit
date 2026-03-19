import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        coal: "#2C3333",
        ocean: "#395B64",
        mist: "#A5C9CA",
        foam: "#E7F6F2",
      },
    },
  },
  plugins: [],
};

export default config;
