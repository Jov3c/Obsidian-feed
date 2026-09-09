# ADR-001: V1 不接入 AI

**Status:** Accepted  
**Date:** 2026-09-09

## Context

产品核心是阅读，不需要摘要。正文识别可以通过 source-specific parser、DOM 评分和确定性清洗实现。

## Decision

V1 不包含任何 LLM SDK、AI API、摘要字段或 AI UI。

## Consequences

优点：

- 无模型成本；
- 更快；
- 可预测；
- 隐私边界简单；
- 无模型供应商锁定。

代价：

- 极端复杂页面解析只能降级到原文；
- 不提供智能摘要。

未来若加入 AI，必须作为独立功能重新设计，不能默认为正文解析必需依赖。
