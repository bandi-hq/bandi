# Bandi Web 前端规则

本文件适用于 `apps/web/**`，并与项目根目录 `CLAUDE.md` 共同生效。根规则中的产品边界与安全约束不可放宽。

## 技术与职责

- 本目录是 React 19、TypeScript、Vite、Tailwind CSS v4 的界面实现。
- Web 端负责多 Agent 配置资产的查看、编辑与明确反馈，不承担任务执行、聊天、终端、调度或运行监控。
- 当前模拟能力不得伪装成真实探测、安装、连接、保存、备份、命令执行或 Claude Code Session 启动。
- 未明确接入真实能力前，业务 mock 只保存在 React 当前页面内存；不得写入 `localStorage`、文件、Tauri 或后端。主题偏好可独立保存在 `localStorage`。

## 界面与交互

- 保持克制、简单、明了、大气的黑白灰视觉；仅成功、警告、危险使用语义色。
- 复用 `src/styles.css` 的语义 Token、`src/components/ui/*` 和现有业务组件，不建立平行设计系统。
- 新增页面、导航、状态或流程前，确认其直接服务于多 Agent 配置管理。
- 默认简单、按需展开，减少导航层级、默认信息密度、技术术语和主操作数量。
- Overlay 语义固定：邻近快速选择使用 Popover；简短表单和业务内容使用居中 Dialog；仅 `<960px` 移动主导航使用左侧 Sheet。
- AI 客户端 Logo 使用本地官方资产或明确文字回退，不依赖远程 URL，不临摹品牌，不暗示官方背书。
- 响应式边界沿用当前应用壳：`>=1280px`、`960–1279px`、`<960px`；页面 body 不得横向滚动，宽内容必须在自身容器内滚动。

## 可访问性与代码质量

- 图标按钮必须有可访问名称；装饰图标使用 `aria-hidden` 或空 `alt`。
- Dialog、Popover、Sheet 必须支持键盘操作、Escape、可见焦点和关闭后的合理焦点恢复。
- 表单必须有可见 label，错误紧邻字段并通过 ARIA 关联；状态不能只依赖颜色表达。
- 遵循 `prefers-reduced-motion`，动画应克制且服务于空间关系。
- TypeScript 保持严格类型；匹配现有命名、注释密度和组件风格。
- 简洁优先，复用公共逻辑，避免无必要的状态库、抽象层、Adapter、Repository 或未来假设。
- 不整文件覆盖并发改动明显的 `pages.tsx`、`router.tsx`、`mock.ts`、`state.tsx` 等文件；以当前工作树为基线增量合并。

## 验证

前端改动完成后按影响范围运行：

```text
pnpm --filter @bandi/web lint
pnpm --filter @bandi/web typecheck
pnpm --filter @bandi/web test
pnpm --filter @bandi/web build
git diff --check
```

界面改动还必须使用真实 Chromium 检查目标页面、亮暗主题、桌面和窄屏、键盘焦点、控制台错误及横向溢出。无法运行的验证必须明确说明。
