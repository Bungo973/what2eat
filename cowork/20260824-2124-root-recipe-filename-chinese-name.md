# 菜谱文件名改用中文菜名（取代同日更早的 id 前缀方案）

- Agent：root
- 时间：2026-08-24T21:24:00+08:00
- 状态：完成
- 任务：用户在确认 `[[20260824-2049-root-recipe-filename-includes-id]]` 记录的英文 id 前缀方案后，进一步要求改成纯中文菜名 + 版本号（`<菜名>-vN.md`），理由是 Obsidian 图谱/文件浏览器里中文菜名比英文 slug 更好辨认。本记录取代前一份记录里"英文id+版本号"这一具体文件名格式的最终形态，folder 名（`recipe_id`）本身不受影响。

## 修改

- `packages/recipe-domain/src/repo.ts`：**整体用 Write 重写**（而不是继续用 Edit 增量改），原因见下方"重要事故"。核心变化：
  - 新增 `FILENAME_UNSAFE_RE`（`[<>:"/\\|?*]`）与 `sanitizeFilenameSegment(name, subject)`：把 frontmatter `name` 清理成合法文件名片段（去掉 Windows/常见文件系统不允许的字符与结尾的点），清理后为空则报 `DATA_INVALID`。
  - `scan()`：文件名校验从"必须等于 `${dir.name}-vN.md`"改为"必须等于 `${sanitize(meta.name)}-vN.md`"；文件夹名（稳定 `recipe_id`）与内容里的 `recipe_id`/`version` 一致性检查不变。
  - `resolveRecipePath(recipeId, version, name)`：新增 `name` 参数，返回路径的文件名部分改为 `${sanitize(name)}-v${version}.md`。
  - `writeRecipe()` 内部调用同步传入 `doc.meta.name`。
  - 类文档注释同步更新为"文件夹名仍是稳定的 recipe_id，文件名前缀改用 frontmatter 里的中文 name"。
- `packages/recipe-domain/src/publish.ts`：`publishDraft()`、`archiveRecipe()` 里 `resolveRecipePath()` 调用补上 `meta.name` 参数；`relPath` 改成用 `basename(targetPath)` 派生，不再手写文件名字符串（避免和实际落盘文件名脱节）。
- `knowledge/menu/recipes/**`：16 篇已发布菜谱物理重命名，例如 `mapo-tofu/mapo-tofu-v1.md` → `mapo-tofu/麻婆豆腐-v1.md`（文件夹名 `mapo-tofu` 不变）。全部通过 PowerShell 读字节确认文件名是正确的 UTF-8 中文，没有乱码。
- `README.md`、`knowledge/menu/首页.md`、`specs/knowledge/obsidian-knowledge-base-sketch.md`：命名约定描述更新为"文件夹名是稳定 recipe_id，文件名前缀是发布时刻的中文菜名"。
- `tests/recipe-domain.test.ts`：
  - `writePublished()` 改成从 `baseMeta(...).name` 派生文件名前缀，而不是用 `id`。
  - `resolveRecipePath` 相关测试补上 `name` 参数；新增一条用例验证菜名里的 `/ : *` 等非法字符会被过滤。

## 重要事故：一次 Edit 调用把源码写出了隐藏的空字节

在写 `FILENAME_UNSAFE_RE = /[\\/:*?"<>| -]/g` 这一行时，通过 `Edit` 工具写入后，`packages/recipe-domain/src/repo.ts` 里出现了肉眼不可见的字节级损坏：正则里 `| -]` 这段（竖线、空格、连字符、右括号）在磁盘上实际变成了 `| \x00 - \x1F ]`（多出一个 NUL 字节和一个 Unit Separator 控制字符）。`Read` 工具把文件内容展示给我时是完全正常的可读文本，触发这个问题的是 Git Bash 的 `grep -c`/`file` 报告"binary file"和 440 处空字节，进一步用 PowerShell `[System.IO.File]::ReadAllBytes` 直接读字节才确认精确位置（offset 799，只有 1 个真实 NUL，Git Bash 的计数本身也不准）。

处置方式：放弃继续用 `Edit` 做增量修补（因为 `Edit` 的字符串匹配是基于工具展示给我的"逻辑文本"，而磁盘上的字节已经和这份逻辑文本不一致，继续 `Edit` 会匹配失败或者可能再次触发同一类问题），改用 `Write` 把整个文件按我确认过的干净内容整体重写一遍，随后用 PowerShell 逐字节校验（`null=0`, 控制字符=0）。为规避同一类字符序列，最终的字符类改写为 `[<>:"/\\|?*]`（去掉了原本要额外处理的空格和连字符，连字符改为不过滤——中文菜名一般不含连字符，即使包含也是合法文件名字符，不需要清理）。

本次事故后，对本轮所有被 `Edit`/`Write` touch 过的文件（`publish.ts`、`tests/recipe-domain.test.ts`、`tests/tool-contracts/schemas.test.ts`、`README.md`、`知识库首页.md`、`维护说明.md`、`obsidian-knowledge-base-sketch.md`、模板文件、`templates.json`）逐一用 PowerShell 读字节做了空字节/控制字符扫描，确认只有这一处受影响，且已修复。

## 决定

- 中文名前缀不做"跨版本必须一致"这类额外约束：不同版本各自按自己发布时刻的 `meta.name` 生成文件名前缀，允许后续版本改名（例如菜名订正）时文件名跟着变，因为每个版本文件在发布后本身就不再被修改，这不违反"已发布不可原地覆盖"的原则。
- `resolveRecipePath` 的路径穿越防护逻辑不变（`relative()` + 越界检查），只是文件名片段的来源从 `recipeId` 换成清理后的 `name`；清理逻辑本身通过剔除 `/ \` 等分隔符，天然阻断了利用 `name` 字段做路径穿越的可能性。
- 未改 `PRD/AI原生菜谱Agent-PRD-V0.4.md`，理由同前一份记录：这是知识库内部文件名格式细节，不是 MCP 对外契约变化；是否要专门发 PRD 版本记录，仍然留给用户决定。

## 验证

- `npm test`：通过，6 个测试文件、**72** 项测试全部通过（新增 1 条文件名非法字符过滤的用例）。
- `npm run recipe -- validate`：通过，"校验通过：16 道已发布菜谱"。
- `npm run build`：通过（`skill:check` + 三个 workspace 的 `tsc --noEmit`）。
- PowerShell 逐字节校验：本次改动涉及的全部文件 null/控制字符计数均为 0。
- PowerShell `Get-ChildItem` 确认 `knowledge/menu/recipes/**` 下 16 个文件名均为正确显示的中文，无乱码。

## 遗留

- PRD V0.4 §5.1 与当前实现的文件名格式不一致（历史遗留问题，见上一份记录），未处理，留给用户决定是否需要发 PRD 补丁版本。
- 本次事故提示：以后凡是正则/字符类里出现"空格 + 连字符"这类相邻的特殊字符组合时，写入前应主动做一次字节级校验，不能只信任 `Read` 工具展示的内容。
