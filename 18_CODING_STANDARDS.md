# Obsidian Feed V1 — 编码与工程规范

## 1. TypeScript

`strict: true`。

禁止：

- 大面积 `any`；
- `as unknown as X` 绕过边界校验；
- 非空断言到处 `!`；
- catch 后静默吞错。

外部输入先 `unknown`，Zod parse 后进入业务。

## 2. Naming

- class/type: PascalCase；
- function/variable: camelCase；
- DB columns: snake_case；
- API JSON: camelCase；
- error code: SCREAMING_SNAKE_CASE；
- CSS: `of-` prefix；
- IDs: `src_`, `art_`, `sub_`, `med_`。

## 3. File responsibility

一个文件应能用一句话描述。

触发拆分信号：

- > ~400 行且混合多个职责；
- route 文件包含 parser；
- renderer 文件包含 API 请求；
- provider 文件包含 SQL 查询。

行数不是硬规则，职责是硬规则。

## 4. Dependency direction

```text
routes → services → repositories/providers
plugin views → api/state/reader/vault
shared models ← both sides
```

不得反向 import UI。

## 5. Error handling

外部错误在边界 normalize；业务层使用 typed error。

不要：

```ts
throw new Error("failed")
```

如果用户/策略依赖错误类型。

## 6. Comments

注释解释“为什么”，不解释显而易见语法。

安全边界、平台兼容 workaround 必须注释来源/原因。

## 7. Formatting

- Prettier；
- ESLint；
- no unused vars/imports；
- import sorting 可用 lint 规则；
- LF UTF-8。

## 8. Git

Conventional-ish commits：

```text
feat(plugin): add reader view
feat(server): add rss provider
fix(parser): preserve nested section text
security(server): block private redirect targets
test(markdown): cover note-preserving update
```

每个实施任务结束有可独立 review 的 commit。

## 9. Secrets

`.env` 不提交；提交 `.env.example`。

CI 做简单 secret scan。

## 10. Docs

修改 API/model/provider 行为必须同步：

- schema；
- docs；
- tests。

“代码先改，文档以后补”不作为完成状态。
