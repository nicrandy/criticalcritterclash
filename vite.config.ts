import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  // basic-ssl serves dev over self-signed HTTPS so phone testing on the LAN
  // gets a secure context — required for camera access (the QR scanner).
  // It only affects `npm run dev`; production builds are untouched.
  plugins: [react(), basicSsl()],
  server: {
    port: 4174,
  },
});
