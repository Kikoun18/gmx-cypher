// The smoke test (R4d, T46): `npm run e2e`, outside `npm test`. It starts the runner itself with the fake gmx.
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  // The 3D view is drawn in software here (SwiftShader): on a loaded machine a step can take longer than 5 s.
  expect: { timeout: 15_000 },
  reporter: 'list',
  use: {
    viewport: { width: 1280, height: 860 },
    // WebGL in headless Chromium without a GPU, for the 3D view.
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
})
