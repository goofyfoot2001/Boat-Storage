import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves the site from /Boat-Storage/; locally it's at the root.
  base: process.env.BASE_PATH || "/",
  // The preview tool hands out a free port through PORT.
  server: { port: Number(process.env.PORT) || 5180, strictPort: !!process.env.PORT },
});
