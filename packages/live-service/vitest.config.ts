import { defineConfig } from 'vitest/config';

// Database tests make many sequential queries; against a remote Postgres each is a network round trip.
export default defineConfig({ test: { testTimeout: 60_000, hookTimeout: 60_000 } });
