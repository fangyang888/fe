# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```


// 40 44 9 21 47 48 5

## 32 码追踪页的 Qwen 向量回测

使用 Node 20.19+。在 `experiments/likely32-vector/.env` 设置 `EDU_EMBED_BASE_URL`、`EDU_EMBED_MODEL` 和 `EDU_EMBED_API_KEY`。模型可设置为 `qwen3.7-text-embedding`，基址填写服务提供的 OpenAI 兼容 API 基址。

```sh
pnpm likely32:embedding
pnpm likely32:embedding ./history-export.json
```

默认读取本地 `/api/history`，也可以传入同格式的 JSON 文件或历史接口 URL。脚本仅发送开奖前的号码状态，按批缓存向量并生成 `public/likely32-embedding-report.json`。打开 `/fe/kill/likely32-vector-tracker` 即可查看。ECS 上的自动更新随历史同步触发，配置见 [部署指南](deploy/deploy.md#32-码追踪页的-qwen-报告)。

额度不足时，可在命令末尾加 `--cached-only`，用已有缓存生成连续区间的回测。报告会标明缺少向量的期数和实际截止期。

报告也比较余弦、角度、欧氏距离、曼哈顿距离、Pearson、Spearman 和中心化余弦。各算法共享近邻和换码规则，依据 2025 年及以前的命中率选定候选，再查看 2026 年及以后表现。已有向量可直接用于对照。

融合实验将 Qwen 和手工向量各自的近邻排名转换为百分位，再按固定比例合并。另比较按近邻年龄降权、按前 100 期滚动中心化，以及沿用现有换码学习门槛。

融合启用门槛使用前 100 期的同期命中差异。至少出现 4 次差异且平滑救回占比 `(救回 + 1) / (救回 + 损失 + 2)` 达到 60% 时，启用 Qwen 75% 加原向量 25% 的排名融合。其余期次使用原向量。规则从 2026-323 期后固定，后续开奖独立计数。脚本为下一期生成一组融合候选，未启用融合时可展开对照。继续使用 `--cached-only` 可只读本地向量缓存。

用实时历史接口生成报告时会复核历史，再在 `data/likely32-fusion-journal/` 保存每期首份预测与原向量对照。重复计算保留首份记录，历史修订或时间无法核验的记录跳过计分。计分对照历史接口的 `created_at` 入库时间，开奖时间需另行核验。JSON 文件输入可回放历史，留档使用 URL 输入。
