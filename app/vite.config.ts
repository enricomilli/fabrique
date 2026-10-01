import { defineConfig, loadEnv } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { paraglideVitePlugin } from '@inlang/paraglide-js'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    nitro({ rollupConfig: { external: [/^@sentry\//] } }),
    tailwindcss(),
    paraglideVitePlugin({
      project: './config/i18n.inlang',
      outdir: './src/paraglide',
      outputStructure: 'message-modules',
      emitTsDeclarations: true,
      cookieName: 'PARAGLIDE_LOCALE',
      strategy: ['url', 'cookie', 'preferredLanguage', 'baseLocale'],
      routeStrategies: [
        { match: '/api/:path(.*)?', exclude: true },
        { match: '/_serverFn/:path(.*)?', exclude: true },
        { match: '/assets/:path(.*)?', exclude: true },
      ],
      urlPatterns: [
        {
          pattern: '/api/:path(.*)?',
          localized: [['en', '/api/:path(.*)?'], ['fr', '/api/:path(.*)?']],
        },
        {
          pattern: '/_serverFn/:path(.*)?',
          localized: [['en', '/_serverFn/:path(.*)?'], ['fr', '/_serverFn/:path(.*)?']],
        },
        {
          pattern: '/assets/:path(.*)?',
          localized: [['en', '/assets/:path(.*)?'], ['fr', '/assets/:path(.*)?']],
        },
        {
          pattern: '/:path(.*)?',
          localized: [
            ['en', '/en/:path(.*)?'],
            ['fr', '/fr/:path(.*)?'],
          ],
        },
      ],
    }),
    tanstackStart(),
    viteReact(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
})

export default defineConfig(({ command, mode }) => {
  if (command === 'serve') {
    // Load server values for development without changing shell values.
    const localEnv = loadEnv(mode, process.cwd(), '')
    for (const [key, value] of Object.entries(localEnv)) {
      process.env[key] ??= value
    }
  }
  return config
})
