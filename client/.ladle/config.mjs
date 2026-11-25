// Ladle: danh mục component dùng chung (npm run ladle → http://localhost:61000). Truyện viết trong *.stories.jsx.
export default {
  stories: 'src/renderer/src/**/*.stories.jsx',
  viteConfig: '.ladle/vite.config.mjs',
  outDir: 'out/ladle',
  addons: { a11y: { enabled: true }, theme: { enabled: true, defaultState: 'light' }, width: { enabled: true } }
}
