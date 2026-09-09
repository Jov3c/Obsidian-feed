# ADR-004: 阅读与导出共用 ArticleDocument

**Status:** Accepted  
**Date:** 2026-09-09

## Context

直接渲染原始 HTML 会造成 XSS、微信样式污染、移动端不一致；阅读和导出分别解析又会产生差异。

## Decision

所有来源先转换为版本化 `ArticleDocument`。Reader 和 Markdown converter 都只消费它。

## Consequences

- 安全边界清晰；
- 测试容易；
- 样式统一；
- 某些高度视觉化公众号设计会丢失装饰，但内容顺序和语义应保留。
