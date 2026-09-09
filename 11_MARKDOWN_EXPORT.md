# Obsidian Feed V1 — Markdown 保存与摘录规范

## 1. 原则

保存的文件必须脱离插件可长期阅读。

- 普通 Markdown；
- 少量 Obsidian wiki image link 是允许的；
- 不写自定义 HTML 组件；
- 不写需要插件解释的私有 JSON block；
- 正文顺序与 Reader 一致。

## 2. 路径

默认：

```text
Feed/<类型>/<来源>/<文章标题>.md
```

类型：

- `微信公众号`
- `RSS`

### Path sanitize

替换：

```text
\ / : * ? " < > |
```

并：

- trim trailing dots/spaces；
- 文件名最多 120 Unicode code points；
- 空标题 fallback `未命名文章-<date>`；
- 冲突：如果 canonical_url 相同则更新同一笔记；否则追加 ` (2)`。

## 3. Frontmatter

默认：

```yaml
---
type: article
source_type: wechat
source: 机器之心
author: 张三
published: 2026-09-09
saved_at: 2026-09-09T12:00:00+08:00
original_url: https://mp.weixin.qq.com/s/...
obsidian_feed_article_id: art_xxx
---
```

字段缺失时：

- author 不写空字符串；
- published 没有则省略；
- source 必须有。

YAML string 必须安全序列化，不手拼可能破坏 YAML 的标题。

## 4. Body template

```markdown
# 文章标题

> 来源：[机器之心](https://mp.weixin.qq.com/s/...)

## 我的笔记

## 我的摘录

---

## 正文

正文……
```

### 为什么有固定 section

`我的笔记` 和 `我的摘录` 是用户可编辑区；正文重新保存时不得覆盖这两块。

## 5. Idempotent update

保存同一 article 第二次：

1. 通过 frontmatter `obsidian_feed_article_id` 找现有笔记；
2. 读取并解析 marker；
3. 保留用户笔记/摘录；
4. 更新 metadata 与正文；
5. 若无法安全解析现有结构，不覆盖，提示用户并创建 `-updated` 文件。

建议隐藏 marker：

```markdown
<!-- obsidian-feed:body:start -->

## 正文

...
<!-- obsidian-feed:body:end -->
```

用户区域在 marker 外。

## 6. Markdown conversion

### Paragraph

TextRun → Markdown escaping。

### Marks precedence

推荐嵌套：

```text
code（不再嵌套其他 marks）
bold/italic/strike
link 最外层
```

### Heading

- document title → `#`；
- heading block level 2–4 原样。

### Quote

每行 `> `。

### List

- unordered `- `；
- ordered `1. `；
- nested 2 spaces or 4 spaces consistent；
- 超 4 层已在 model normalize。

### Code

选择不与 code content 冲突的 fence 长度（至少 3 backticks）。

### Table

简单 table → GFM table；
包含换行复杂 cell 时 fallback 为分段文本，避免生成坏表格。

### Divider

`---`

## 7. Images — local mode

目录：

```text
<saveRoot>/_attachments/<article-id>/
```

命名：

```text
001-<short-hash>.jpg
002-<short-hash>.png
```

Markdown：

```markdown
![[Feed/_attachments/art_xxx/001-ab12cd.jpg]]
```

或者使用相对 Markdown link。项目内固定一种；推荐 Obsidian wiki link，因为移动端路径稳定。

## 8. Image download

插件只从自己的 Feed Server media route 下载，不直接重复请求微信 CDN：

```text
ArticleDocument.image.src
→ server media URL
→ requestUrl arrayBuffer
→ vault.createBinary
```

限制：

- 单图默认 20MB；
- 总文章图片默认 200MB；
- 超出提示并保留远程 media URL；
- mime allowlist：jpeg/png/gif/webp/svg? V1 建议不落地 SVG，转/保留远程；
- 文件扩展名从可信 MIME 推导，不信 URL 后缀。

## 9. Images — remote mode

```markdown
![caption](https://feed-server/v1/media/med_xxx)
```

注意如果 server 以后离线，图片不可用。设置 UI 应解释差异。

## 10. Extract

如果笔记不存在：先创建完整文章笔记。

然后在 `## 我的摘录` 和正文 marker 之间插入：

```markdown
> 选中的文字第一行
> 第二行

— 摘录于 2026-09-09 12:34
```

同一选区重复摘录：V1 可允许重复，不做复杂 semantic dedupe；但连续 5 秒内完全相同内容应防双击重复。

## 11. Opening saved note

保存完成后 Reader menu 文案变为“打开笔记”。

插件维护一个轻量 `articleId -> vaultPath` 映射也可以，但真正来源仍以 frontmatter 为准。映射失效时搜索 metadata cache / Vault file metadata。

## 12. Atomic write

Obsidian API 无通用 POSIX rename transaction 时：

- 新建：`vault.create`；
- 更新：先读取，构造完整文本，再 `vault.modify`；
- 不逐段多次修改同一文件；
- 异常不留下半份文档。
