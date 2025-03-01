import { defineConfig } from "vitest/config";
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });
dotenv.config({ path: '../.env' });

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    testTimeout: 30000, // 30 seconds since we're using real network
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "dist/",
        "**/*.test.ts",
        "**/*.spec.ts",
        "**/types/**",
      ],
    },
  },
});
