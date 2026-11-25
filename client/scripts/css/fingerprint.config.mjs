import { defineConfig } from '@playwright/test'
export default defineConfig({ testDir: '.', testMatch: 'fingerprint.spec.mjs', workers: 1, outputDir: '../../out/fp-results', use: {} })
