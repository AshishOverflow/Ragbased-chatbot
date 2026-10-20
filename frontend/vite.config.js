import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The host binding (0.0.0.0 inside Docker) is passed on the command line, not set here.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
});
