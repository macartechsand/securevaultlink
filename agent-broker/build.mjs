// Bundles the broker (and the app's crypto code it reuses) into one file: dist/securevault-mcp.mjs.
// Uses the esbuild and @supabase/supabase-js already installed in web-saas (no extra dependencies).
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const webModules = join(here, '..', 'web-saas', 'node_modules');
const require = createRequire(join(webModules, 'noop.js'));
const esbuild = require('esbuild');

await esbuild.build({
  entryPoints: [join(here, 'src', 'main.ts')],
  outfile: join(here, 'dist', 'securevault-mcp.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  nodePaths: [webModules],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  legalComments: 'none',
  logLevel: 'info',
});

await esbuild.build({
  entryPoints: [join(here, 'src', 'broker.ts')],
  outfile: join(here, 'dist', 'broker.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  nodePaths: [webModules],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  legalComments: 'none',
  logLevel: 'warning',
});
