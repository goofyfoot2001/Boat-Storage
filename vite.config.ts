import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves the site from /Boat-Storage/; locally it's at the root.
  base: process.env.BASE_PATH || "/",
  // Short build id shown in the app, so it's easy to tell whether a phone has the latest version.
  define: { __BUILD__: JSON.stringify((process.env.GITHUB_SHA ?? "local").slice(0, 7)) },
  // The preview tool hands out a free port through PORT.
  server: { port: Number(process.env.PORT) || 5180, strictPort: !!process.env.PORT },
});
