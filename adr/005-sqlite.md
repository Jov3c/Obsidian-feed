# ADR-005: V1 使用 SQLite，不使用 Redis

**Status:** Accepted  
**Date:** 2026-09-09

## Decision

Node 22.5+ `node:sqlite` + Drizzle，WAL 模式。任务使用进程内 bounded concurrency。

## Rationale

目标是个人自托管，数据量和并发不需要 Redis/Kafka。减少部署复杂度比提前水平扩展更重要。
