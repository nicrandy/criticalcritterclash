import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  // basic-ssl serves dev over self-signed HTTPS so phone testing on the LAN
  // gets a secure context — required for camera access (the QR scanner).
  // Set VITE_NO_HTTPS=1 for tooling that rejects self-signed certs (e.g. the
  // preview browser). Production builds are untouched either way.
  plugins: [react(), ...(process.env.VITE_NO_HTTPS ? [] : [basicSsl()])],
  server: {
    port: 4174,
  },
});
