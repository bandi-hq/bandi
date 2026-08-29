# AI 客户端品牌资产说明

获取日期：2026-08-29。

这些标志仅用于在 Bandi 中识别第三方客户端，不表示相关权利方赞助、认可或与 Bandi 建立合作关系。软件源码许可证不自动授予商标权；请同时遵守各品牌的商标与品牌使用规范。

| 本地文件 | 客户端 | 官方来源 | SHA-256 | 说明 |
|---|---|---|---|---|
| `claude-code.svg` | Claude Code | [Anthropic Press Kit](https://www.anthropic.com/press-kit) | `d8a00c51cd1a31e85f8ca264f89617894d4c2ed9c72e71ccdc00f84bcca7a6a3` | 官方 Claude Code 单色标志；保持比例，不重绘。 |
| `claude.svg` | Claude Desktop | [Anthropic Press Kit](https://www.anthropic.com/press-kit) | `059e22f525d67c6258c4f64514f0b0e717c914df8a706936d0299d5e6b8082d9` | 官方 Claude 圆角图标。 |
| `gemini-cli.svg` | Gemini CLI | [Google Gemini CLI 官方仓库](https://github.com/google-gemini/gemini-cli) | `481639ca1cf1518925779b7dda9a8b446911c262312c59f029f31e905214a167` | 官方终端 Header 快照包含完整界面，不适合作为紧凑产品图标，因此当前 UI 使用文字徽标；品牌使用受 [Google Brand Resource Center](https://about.google/brand-resource-center/) 约束。 |
| `opencode.svg` | OpenCode | [OpenCode 官方仓库](https://github.com/anomalyco/opencode/blob/dev/packages/ui/src/assets/favicon/favicon-v3.svg) | `e29bbe33380ad1c1ada9134b52f229d30e9776d60481512c9d81f2bb6f37def9` | 官方方形应用图标；仓库代码为 MIT，商标权另行保留。 |
| `openclaw.svg` | OpenClaw | [OpenClaw 官方仓库](https://github.com/openclaw/openclaw/blob/main/ui/public/favicon.svg) | `3351f513d5a60049730dce4d1e4a789820a11f3729bc372c58fecfe469e86419` | 官方动态 favicon；已禁用动效以遵守 reduced-motion 和桌面工具的克制风格。仓库为 MIT，商标权另行保留。 |
| `pi.svg` | Pi | [Pi Press Kit](https://pi.dev/press-kit) / [官方网站仓库](https://github.com/earendil-works/pi-website/blob/main/src/favicon.svg) | `a5624bc3b8cac94de75f6f13701eca2ad3ef67bbeba286c4af3f398806f0858a` | 官方方形徽标；网站仓库为 MIT，商标权另行保留。 |

## 文字徽标回退

Codex、Grok Build、Hermes 当前没有找到可明确再分发且适合紧凑 UI 的独立官方图标；Gemini CLI 官方仓库的可核验资产是终端界面快照而非独立图标。因此这些客户端使用稳定 `shortName` 文字徽标，不使用第三方图标库、网页截图或自行临摹的 Logo。未来获得官方可用资产后，仅需更新前端 `AiClientKind → 本地资源` 映射，不影响后端数据协议。
