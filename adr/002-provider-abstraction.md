# ADR-002: 微信采集使用 Provider / Adapter 抽象

**Status:** Accepted  
**Date:** 2026-09-09

## Context

微信公众号内容获取路径不稳定，历史项目与当前项目不断变化。把某个微信协议直接写入插件会导致高耦合。

## Decision

插件只连 Feed Server；Feed Server 使用 `WeChatProvider`，V1 默认 `WeRssAdapter`。

## Consequences

- 可替换 WeRSS/WechRss/其他上游；
- 凭据集中在服务端；
- 插件移动端简单；
- 需要部署额外 sidecar 才能使用微信能力。
