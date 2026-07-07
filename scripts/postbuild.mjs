// GitHub Pages SPA fallback: Pages serves 404.html for unknown paths, so a copy of
// index.html lets deep links like /projects/kill-bunny boot the app instead of 404ing.
import { copyFileSync } from 'node:fs'

copyFileSync('dist/index.html', 'dist/404.html')
console.log('postbuild: dist/404.html written (SPA fallback)')
