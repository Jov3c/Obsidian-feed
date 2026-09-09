# Obsidian Feed V1 — UX 与阅读体验规范

## 1. 体验目标

阅读页是产品本体。所有其他页面都服务于“找到文章并进入阅读”。

设计关键词：

- 安静；
- 内容优先；
- 原生 Obsidian；
- 中文长文舒适；
- 手机可单手使用；
- 控件只在需要时出现。

## 2. 导航模型

### Desktop

插件使用一个主 `ItemView`，内部状态切换：

```text
Today → Reader
Subscriptions → Reader
```

桌面不强制三栏。V1 推荐单主栏 + 轻侧面板，而不是把文章列表长期挤在 300px 窄栏。

### Mobile

严格 stack navigation：

```text
Today
  ↓ tap
Reader
  ↓ back
Today
```

订阅管理同理。不要在 <= 700px 时做双栏。

## 3. Today View

### 结构

```text
┌────────────────────────────────────┐
│ 今天                         ↻   + │
├────────────────────────────────────┤
│                                    │
│ GPT 新模型正式发布                  │
│ 机器之心 · 10:32                   │
│                                    │
│ 苹果发布新版系统                    │
│ 少数派 · 09:15                     │
│                                    │
│ Obsidian 更新                       │
│ Obsidian Blog · 昨天               │
│                                    │
└────────────────────────────────────┘
```

### 文章行

- 最少高度：68px；
- 标题最多 2 行；
- 来源/时间 1 行；
- 未读使用左侧 3px 小圆点或轻字重差异；
- 不展示摘要；
- 不展示强制封面；
- hover/focus 使用 Obsidian 自身背景变量。

### 可访问性

- 行可键盘聚焦；
- Enter 打开；
- `aria-label` 包含标题、来源和已读状态；
- 不用仅颜色表达已读。

## 4. Subscriptions View

```text
订阅                                    +

微信公众号
机器之心                        刚刚同步
少数派                          12分钟前
某来源                   需要重新授权  !

RSS
OpenAI Blog                     8分钟前
Obsidian Blog                   1小时前
```

右键/长按菜单：

- 刷新；
- 打开来源；
- 取消订阅。

“删除来源历史数据”不跟“取消订阅”绑定。V1 取消订阅只停同步。

## 5. Add Subscription Modal

单输入框：

```text
添加订阅

粘贴 RSS、网站或微信公众号文章链接
[ https://...                          ]

                         取消   识别
```

识别中不关闭 Modal。

成功：

```text
机器之心
微信公众号
最近更新：今天

                         返回   订阅
```

错误必须可理解：

- “这不是可识别的 RSS/Atom 或微信公众号文章链接”；
- “微信公众号采集服务需要重新授权”；
- “该链接暂时无法访问”；
- “Feed Server 未连接”。

不要只显示 HTTP 500。

## 6. Reader View

### Desktop layout

正文容器：

```css
.reader-content {
  width: min(var(--feed-reader-width), calc(100vw - 48px));
  margin: 0 auto;
  font-size: var(--feed-font-size);
  line-height: var(--feed-line-height);
}
```

默认变量：

```text
--feed-reader-width: 720px
--feed-font-size: 17px
--feed-line-height: 1.8
```

### Header

```text
←                                      ···

文章标题

来源 · 2026 年 9 月 9 日
```

- H1 desktop 30px，mobile 26px；
- title line-height 1.3；
- metadata 13–14px；
- 标题与正文之间留足空间；
- 不显示订阅按钮、相关推荐、AI 按钮。

### Paragraph

- margin block：`0 0 1.05em`；
- 中文正文不首行强制缩进；
- 使用 Obsidian font variables；
- 不加载网络字体。

### Heading

- H2: 1.45em / 650 weight；
- H3: 1.2em / 650；
- 上方间距明显大于下方；
- 不照搬微信 inline color/font-size。

### Links

- 使用 Obsidian link color；
- 外部链接清楚可识别；
- 点击通过 `window.open`/Obsidian 合法外链方式打开；
- 不在插件内 iframe 打开微信页面。

### Blockquote

轻量边线 + 背景，不使用高饱和色。

### Code

- 保留 inline code / fenced code；
- 横向 overflow；
- 不把超长代码撑破正文。

### Tables

- 包裹可横向滚动容器；
- 手机不缩到不可读。

## 7. Mobile

### Spacing

```text
viewport <= 700px
horizontal padding: clamp(18px, 5vw, 22px)
```

### Toolbar behavior

- 向下滚动 > 24px：toolbar 添加 `is-hidden`；
- 向上滚动 > 12px：显示；
- 到顶部总是显示；
- 动画 160–220ms；
- `prefers-reduced-motion` 时禁用位移动画。

### Hit targets

最小 44x44 CSS px。

## 8. Reading Progress

顶部 2px 进度条：

- scroll 时淡入；
- 1.2 秒无滚动后淡出；
- 进度 = `scrollTop / maxScrollTop`；
- 不长期占视觉注意。

## 9. Restore position

顺序：

1. 若保存 `scrollAnchor` 且对应 block 存在，滚到 block；
2. 应用 `anchorOffsetPx`；
3. 否则用 `progress`；
4. 内容高度稳定后再恢复，避免图片懒加载引起跳动；
5. 图片加载后不得把用户拉回旧位置。

## 10. Image Viewer

点击正文图片：

- modal/overlay；
- 黑/主题背景；
- image `object-fit: contain`；
- 手机支持浏览器原生 pinch zoom 能力时不阻止；
- Esc / 点背景关闭；
- 原图加载失败显示错误占位；
- 不提供下载按钮作为 V1 主操作。

## 11. Selection / Extract

桌面 selection 完成后，在 selection 附近提供：

```text
复制 | 摘录
```

移动端依赖系统选择菜单限制较多，V1 可使用 Reader toolbar 中“摘录当前选区”命令作为可访问兜底。

摘录时：

- 保留纯文本；
- 多段之间保留换行；
- 不执行选区 HTML；
- 最大 20,000 字符，超出提示用户缩小选择。

## 12. Reader menu

仅：

1. 打开原文；
2. 保存到知识库 / 已保存则打开笔记；
3. 阅读设置；
4. 手动标记已读/未读。

不要塞入“AI总结”“生成思维导图”“分享社区”等。

## 13. Loading skeleton

文章元数据已有但正文在请求时：

- 标题和 metadata 立即显示；
- 正文使用 5–7 条轻 skeleton；
- 500ms 内请求完成可避免 skeleton 闪烁（延迟约 120ms 后展示）。

## 14. Error page

正文请求失败：

```text
文章标题
来源 · 日期

正文暂时无法加载
[重试]   [打开原文]
```

不得导航回列表导致用户丢失上下文。

## 15. Theme compatibility

必须只使用 Obsidian CSS variables 或插件自有中性变量：

- `--background-primary`
- `--background-secondary`
- `--text-normal`
- `--text-muted`
- `--interactive-accent`
- `--divider-color`
- `--font-text`

测试浅色/深色、默认主题以及至少两个常见第三方主题。
