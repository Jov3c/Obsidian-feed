# Obsidian Feed V1 — 正文识别与清洗规范

## 1. 核心原则

“正文判断”不是判断一句话，而是判断 DOM 区域与 block 在整篇文章中的角色。

V1 不用 AI 判断正文。

管线：

```text
Raw HTML
  ↓
HTML safety precheck
  ↓
Source-specific container detection
  ↓
Candidate scoring
  ↓
Block extraction
  ↓
Noise filtering
  ↓
Normalization
  ↓
ArticleDocument
  ↓
Quality assessment
```

## 2. Parser 分层

```text
ParsingPipeline
├── WeChatParser
├── RssContentParser
└── GenericArticleParser (fallback)
```

### WeChatParser

优先使用已知微信正文结构信号 + 候选评分。

### RssContentParser

如果 feed item 自带 `content:encoded` / Atom content，直接解析这段内容，不重新抓网页；如果只有摘要且用户打开需要全文，可尝试 article URL + Generic parser。

### GenericArticleParser

可使用 Mozilla Readability 思路/实现作为兜底。

## 3. Precheck

拒绝或截断：

- 非 text/html；
- body > 5MB；
- NUL 字节异常；
- 极端 DOM depth > 200；
- node 数 > 100,000；
- 明显登录/验证码页面。

## 4. 微信正文容器

不要只写死一个 selector 后无验证。

候选来源：

1. 常见微信正文容器 selector；
2. `article`, `main`；
3. 页面中高文本密度 section/div；
4. 若候选为空，generic fallback。

每个候选计算 score。

## 5. Candidate Score

建议实现成纯函数，参数可配置：

```ts
interface CandidateFeatures {
  textLength: number;
  paragraphCount: number;
  headingCount: number;
  imageCount: number;
  linkTextLength: number;
  linkCount: number;
  buttonCount: number;
  formControlCount: number;
  navLike: boolean;
  footerLike: boolean;
  depth: number;
}
```

推荐基础公式（可以通过 fixture 调参，但不要随意改语义）：

```text
score =
  min(textLength / 100, 80) * 10
+ min(paragraphCount, 40) * 8
+ min(headingCount, 10) * 4
+ min(imageCount, 20) * 2
- min(linkCount, 30) * 3
- (linkTextLength / max(textLength, 1)) * 100
- min(buttonCount, 10) * 15
- min(formControlCount, 10) * 20
- (navLike ? 80 : 0)
- (footerLike ? 60 : 0)
```

额外：

- `article/main` +25；
- 已知高置信微信正文 selector +100，但仍需最低文本/内容验证；
- 候选文本 < 80 字且图片 < 2：不作为完整正文。

## 6. 选择策略

- 选最高 score；
- 如果最高分 < `MIN_CONTAINER_SCORE`（建议 60），进入 generic fallback；
- 如果最高和第二差值过小，优先包含关系中更内层且文本保留率 > 90% 的节点，避免把整页 chrome 包进去；
- 最终容器不得包含页面 header/footer 大量兄弟 UI。

## 7. Block extraction

不要直接保存 `innerHTML`。

DOM → Block：

- `<p>` / 文本型 section → paragraph；
- `<h1..h6>` → heading 2..4；
- `<img>` → image；
- `<blockquote>` → blockquote；
- `<ul>/<ol>` → list；
- `<pre>` → code；
- `<table>` → table；
- `<hr>` → divider；
- 未识别 `div/section` → 递归展开其语义子节点。

## 8. 微信装饰性 section

公众号大量使用 `<section>` 做排版。规则：

- section 本身不是内容类型；
- 如果它只包装一个/多个文本段，展开；
- 如果短文本 + 强调样式 + 周围为正文，可转换为 paragraph/heading/blockquote；
- 不保留 background/color/border inline style；
- 如果视觉卡片无法语义化但包含重要文本，保留文本顺序，宁可丢装饰，不丢内容。

## 9. Inline marks

只提取：

- strong/b → bold；
- em/i → italic；
- del/s → strike；
- code → code；
- a[href] → href；

忽略：

- font-family；
- color；
- background；
- letter-spacing；
- text-indent；
- arbitrary class。

## 10. 图片提取

src 解析顺序：

1. 合法 `data-src`（微信懒加载常见）；
2. `src`；
3. `data-original`；
4. 无合法 URL → 丢弃。

图片 URL 经过：

- HTML entity decode；
- canonicalize；
- scheme allowlist；
- 媒体服务 registration。

不在 parser 中直接下载。

## 11. 噪音过滤

### 强规则删除

- script/style/noscript/template；
- form/input/button；
- iframe（V1 不内嵌第三方 iframe）；
- fixed/floating UI；
- 空节点；
- tracking pixel（1x1、极小透明图）；
- 明确页面导航。

### 语义噪音

不能单靠关键词删除。

定义 `NoiseFeatures`：

```ts
{
  text: string;
  positionRatio: number;
  textLength: number;
  linkDensity: number;
  imageShape?: "square" | "wide" | "tall";
  nearEnd: boolean;
  hasQrHintWords: boolean;
  hasFollowHintWords: boolean;
}
```

例如“长按识别二维码”只有同时满足：

- nearEnd；
- textLength < 80；
- 附近有近似正方形图片；
- 命中扫码/关注语义；

才高置信删除。

正文里“大家都很关注 AI”不得删除。

## 12. 正文终点检测

识别连续正文之后的尾部 chrome：

若最后 15% blocks 中连续出现：

- 短文本；
- 高链接密度；
- QR 线索；
- 来源关注提示；

形成 tail noise cluster，可整体删除。

要求：删除 cluster 前必须至少已有 `MIN_BODY_SIGNAL`：

- >= 300 字，或
- >= 3 正文段 + >= 2 图片。

## 13. 连续性

提取后检查：

- 是否有大量重复段落；
- 是否文字顺序明显错乱；
- 是否 80% 文本都来自链接；
- 是否只有标题没有正文；
- 是否正文中间出现明显页面级菜单 cluster。

## 14. Parse confidence

输出 0..1：

建议组合：

```text
containerConfidence  0.35
contentDensity        0.25
continuity            0.20
noiseConfidence       0.10
metadataConsistency   0.10
```

### 状态

- >= 0.85 → `ready`；
- 0.65–0.85 → `ready`，日志记录低置信度；
- 0.45–0.65 → `partial`；
- < 0.45 → `failed`，默认不展示“完整正文”。

如果原内容本来就很短（如公告），不要仅因字数低而失败，需结合标题和 DOM 结构。

## 15. Content hash

对 normalized `ArticleDocument` 移除 volatile 字段后 canonical JSON 序列化：

```text
SHA-256 → content_hash
```

Block id 可参与，但 block id 本身必须由内容稳定生成，避免循环依赖。

## 16. Parser version

```text
wechat-parser/1.0.0
generic-parser/1.0.0
rss-content-parser/1.0.0
```

数据库保存 parser + parserVersion。

修复 parser 后可定向 reparse 老文章。

## 17. Fixtures

仓库必须保留**经过脱敏/有权使用**的 HTML fixtures：

```text
apps/server/test/fixtures/
├── wechat/
│   ├── normal-text.html
│   ├── many-sections.html
│   ├── image-heavy.html
│   ├── qr-footer.html
│   ├── code-table.html
│   ├── blocked.html
│   └── malformed.html
└── rss/
```

测试 assertion 针对语义 blocks，不针对完整 HTML snapshot。
