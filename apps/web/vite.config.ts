import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Vite builds and serves the React app.
// - react()      → JSX + fast refresh
// - tailwindcss() → Tailwind v4 (no separate config file needed)
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
  },
});
