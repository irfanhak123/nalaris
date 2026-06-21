import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Vite + React. Fast HMR, native TS, no SSR.
//
// Environment variables (set in .env or shell):
//   VITE_GATEWAY_BASE  — Hermes gateway URL (default: http://localhost:8787)
//                        Used by both the dev proxy and the runtime gateway client.
//   VITE_API_BASE      — FastAPI harness URL (default: http://localhost:8790)
//                        Used for the session bridge and legacy block actions.
//   VITE_WORKSPACE     — Workspace path sent to the gateway (default: "workspace")
//   VITE_PROFILE       — Agent profile name (default: "default")

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const GATEWAY = env.VITE_GATEWAY_BASE || 'http://localhost:8790';
  const API = env.VITE_API_BASE || 'http://localhost:8790';

  return {
    plugins: [react()],
    server: {
      port: 5173,
      host: '0.0.0.0',
      strictPort: false,
      proxy: {
        // Gateway (hermes-webui) — chat sessions, SSE streams.
        // Proxied same-origin to avoid CORS + CSRF origin-mismatch.
        // Strip Origin/Referer so the gateway's CSRF check treats these
        // as non-browser requests (same pattern as curl/MCP clients).
        '/api': {
          target: GATEWAY,
          changeOrigin: true,
          configure(proxy) {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.removeHeader('origin');
              proxyReq.removeHeader('referer');
            });
          },
        },
        // FastAPI harness — state, blocks, write actions, panel-session bridge.
        '/state': API,
        '/blocks': API,
        '/chat': API,
        '/write': API,
        '/health': API,
        '/panel-session': API,
      },
    },
    preview: {
      port: 4173,
      host: '0.0.0.0',
      strictPort: false,
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
      target: 'es2022',
    },
  };
});
