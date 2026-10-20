# 架构与数据模型

## 1. 总体结构

```text
浏览器（Vue 3 + Three.js）
  │  fetch /api/*
  ▼
Node HTTP 服务（server/index.js）
  ├─ 静态资源：dist/（生产）
  ├─ 路由：多企划 CRUD + 7 类引擎
  ├─ 持久化：data/projects/<id>.json（原子写 + 每企划 revision）
  └─ 引擎层（纯函数，无 IO）
       expr → stats → combat
       branch → blueprint
       infer / world
```

设计原则：

- **引擎纯函数化**：所有演算不读写磁盘，便于单测与将来搬到 Worker / WASM。
- **多企划隔离**：每个企划是独立 JSON 文件，拥有自己的 revision、模块开关与更新时间；切换企划时前端整页重挂载。
- **前后端同一份企划快照**：页面整体持有 project，编辑后防抖 PUT；调用引擎前先 flush，服务端始终用最新快照计算。
- **可复现**：战斗随机使用种子随机（mulberry32），相同输入得到相同结果；分支概率来自边权重而非随机。

## 2. 项目数据模型

每个企划文件（`data/projects/proj-xxx.json`）：

```jsonc
{
  "project": { /* 见下 */ },
  "revision": 3,
  "updatedAt": "2026-10-20T13:40:00.000Z"
}
```

`project` 顶层：

```jsonc
{
  "id": "proj-mist-harbor",
  "name": "雾港回声",
  "meta": {
    "genre": "悬疑 · 都市奇幻",
    "tone": "潮湿、冷冽、缓慢收紧",
    "logline": "……",
    "author": "叙事组",
    "platform": "PC 叙事 RPG",
    "playtime": "4–6 小时",
    "version": "0.3.0",
    "modules": {
      "narrative": true,
      "characters": true,
      "stats": true,
      "combat": true,
      "branches": true,
      "inference": true,
      "world": true,
      "blueprint": true
    }
  },
  "blueprint": {
    "acts": [
      { "id": "act1", "name": "第一幕 · 雾起", "goal": "把巡夜人拉进失踪案", "tensionTarget": 30 }
    ],
    "themes": [{ "id": "t_memory", "name": "记忆与身份", "motif": "雾" }]
  },
  "stats": {
    "attributes": [ /* Attribute */ ],
    "formulas": [ /* MetricFormula */ ]
  },
  "characters": [ /* Character */ ],
  "skills": [ /* Skill */ ],
  "combat": {
    "defaultPreset": "duel",
    "presets": [{ "id": "duel", "name": "标准决斗", "runs": 2000, "maxRounds": 15, "variance": 0.12, "seed": 20260101 }],
    "dummy": { "id": "dummy", "name": "训练假人", "base": { "hp": 120 }, "growth": {} }
  },
  "narrative": {
    "startId": "n1",
    "nodes": [ /* StoryNode */ ],
    "edges": [ /* StoryEdge */ ]
  },
  "world": {
    "name": "雾港群岛",
    "scaleLabel": "1 格 ≈ 20 米",
    "elements": [ /* WorldElement */ ]
  },
  "cases": [ /* InferenceCase */ ]
}
```

### 模块开关（`meta.modules`）

- 键为路由名：`narrative` / `characters` / `stats` / `combat` / `branches` / `world` / `inference` / `blueprint`。
- `false` 只影响入口与路由访问，数据仍保留；`dashboard` 始终可用。
- **开放世界默认开启**：`DEFAULT_MODULES.world = true`；空白企划带空世界，演示企划带完整地图。
- **推理默认关闭**：`DEFAULT_MODULES.inference = false`。演示企划显式开启；旧数据若已有案件则自动视为开启。
- 路由守卫：当当前模块被关闭时，前端会提示并跳回总览；直接访问 URL 也不会渲染该模块。
- `infer` 引擎本身不检查开关（服务端保持工具中立），是否启用由企划与前端负责。

### 2.1 Attribute（属性）

```jsonc
{
  "key": "atk",            // 表达式标识符
  "label": "攻击",
  "group": "主属性",
  "kind": "primary",       // primary | derived
  "base": 12,
  "growth": 2.4,           // 每级成长
  "min": 0, "max": null,
  "unit": "",
  "formula": "hp / (1 - dodge) * (1 + def / 100)", // kind=derived 时必填
  "desc": "物理伤害基数"
}
```

求值规则：

1. `primary`：`value = clamp(base + growth × (level - 1), min, max)`；角色可覆盖 `base/growth`。
2. `derived`：按公式依赖做 Kahn 拓扑排序后求值；上下文 = 全部已求值属性 + `level` + `lvl` + `stats`。
3. `metrics`（`stats.formulas`）：只用于展示和横向比较，不写入属性，也不参与派生依赖。

### 2.2 Character（角色）

```jsonc
{
  "id": "shen_yan",
  "name": "沈砚",
  "role": "主角 · 巡夜人",
  "faction": "港务局巡夜队",
  "age": 29,
  "archetype": "沉默的追索者",
  "tags": ["失忆", "忠诚", "刀"],
  "color": "#7dd3fc",
  "motivation": "找回被抹去的三年",
  "flaw": "习惯服从体制",
  "bio": "……",
  "arc": { "start": "……", "midpoint": "……", "end": "……" },
  "base": { "hp": 120, "atk": 14, "def": 8, "spd": 11, "crit": 0.1 },
  "growth": { "hp": 14, "atk": 2.6, "def": 1.4, "spd": 0.7, "crit": 0.004 },
  "skillIds": ["pierce", "heavy"],
  "relations": [
    { "targetId": "bai_lu", "type": "情报同盟", "value": 0.6, "note": "欠她两段记忆" }
  ]
}
```

`relations.value ∈ [-1, 1]`，负值为敌对。关系值目前用于展示与推理辅助，可作为后续阵营/结局条件的输入。

### 2.3 StoryNode / StoryEdge（叙事图谱）

```jsonc
// Node
{
  "id": "n9",
  "title": "白鹭的交易",
  "type": "choice",        // scene | choice | combat | hub | ending
  "act": "act2",
  "tension": 55,           // 0–100
  "summary": "她开价：一封第三封信，换你的一段记忆。",
  "text": "……",
  "setFlags": ["entered_tea_house"]   // 进入节点即写入（可选）
}

// Edge
{
  "id": "e12",
  "from": "n9",
  "to": "n11",
  "label": "接受交易",
  "type": "choice",        // linear | choice | conditional
  "weight": 1,             // 概率权重，同节点出口归一化
  "condition": { "expr": "flags.baulu_ally == true", "label": "需要白鹭同盟" },
  "effects": { "flags": { "baulu_ally": true, "has_third_letter": true }, "stats": null }
}
```

约束与检查：

- 非 `ending` 节点必须有至少一条出口，否则报 `DEAD_END`。
- `condition.expr` 使用表达式引擎，可访问 `flags` 对象（`flags.xxx`）与内置函数。
- 同节点出口权重归一化，用于路径概率质量。
- 路径枚举不重复节点（避免环）；真实游戏若允许循环，可扩展为带访问上限的 DFS。

### 2.4 InferenceCase（推理案件）

```jsonc
{
  "id": "case_letter",
  "title": "第三封信是谁写的",
  "question": "是谁把第三封信塞进了沈砚的口袋？",
  "solution": {
    "suspect": "tie_ya",
    "expectedFacts": ["ink_official", "sender_official", "tie_ya_sender"],
    "reasoning": "……"
  },
  "suspects": [
    { "id": "tie_ya", "name": "铁鸦", "role": "港务局执法官", "traits": { "access_ledger": true } }
  ],
  "clues": [
    { "id": "c_ledger", "name": "缺页账本", "desc": "……", "found": true, "weight": 3 }
  ],
  "facts": ["some_initial_fact"],
  "rules": [
    {
      "id": "r_final",
      "name": "锁定寄信人",
      "cf": 0.9,
      "when": [
        { "type": "fact", "name": "alibi_forged", "minCF": 0.5 },
        { "type": "clue", "id": "c_key" },
        { "type": "trait", "suspect": "tie_ya", "trait": "access_ledger" },
        { "type": "expr", "expr": "facts.sender_official >= 0.5", "label": "内部寄信人已确认" }
      ],
      "then": {
        "fact": "tie_ya_sender",
        "label": "铁鸦即为作者",
        "suspicion": "tie_ya",
        "reason": "最终推理链指向铁鸦"
      }
    }
  ]
}
```

规则语义：

- `when` 全部满足才触发；结论 CF = `min(前提CF) × rule.cf`。
- 事实合成：`cf' = cf + cf_new × (1 - cf)`（noisy-OR）。
- `then.eliminate` 在 CF ≥ 0.6 时标记排除；`then.suspicion` 累加嫌疑分。
- 规则只触发一次；`facts` 与 `not_xxx` 同时成立会记入矛盾。
- 未触发且只差一个条件的规则会生成「待补线索」提示。

### 2.5 OpenWorld（开放世界地图）

地图是无限平面上的元素集合，坐标没有边界；前端 Canvas 2D 负责平移/缩放/绘制，数据只存世界坐标。

```jsonc
{
  "world": {
    "name": "雾港群岛",
    "scaleLabel": "1 格 ≈ 20 米",
    "elements": [
      {
        "id": "w-set-oldtown",
        "type": "settlement",
        "name": "雾港老城",
        "x": -780, "y": -60, "radius": 300,
        "color": "#67e8f9",
        "data": {
          "faction": "港务局",
          "population": 4200,
          "hostile": false,       // 敌对与否
          "safeZone": true,       // 是否安全区
          "buffs": [{ "name": "潮汐庇护", "desc": "每 10 秒恢复 2% 生命" }],
          "services": ["商店", "铁匠", "酒馆", "任务"],
          "notes": "……"
        }
      },
      {
        "id": "w-char-bailu",
        "type": "character",
        "name": "白鹭",
        "x": -790, "y": -30,
        "data": {
          "characterId": "bai_lu",   // 可空：独立 NPC
          "faction": "独立",
          "level": 6,
          "dialogues": [
            {
              "id": "d-bailu-shen",
              "name": "只对沈砚说的话",
              "audienceIds": ["shen_yan"], // 空数组 = 所有人可见
              "lines": [{ "speaker": "白鹭", "text": "……" }],
              "choices": [{ "label": "问第三封信", "response": "去钟楼集找阿禾。" }],
              "quest": {
                "id": "q-third-letter",
                "title": "第三封信的线索",
                "summary": "……",
                "objectives": [{ "text": "前往钟楼集", "done": false }],
                "reward": "雾港情报网通行证",
                "status": "未接取"
              }
            }
          ]
        }
      },
      {
        "id": "w-river-mist",
        "type": "river",
        "name": "雾河",
        "x": -1500, "y": -520,
        "points": [{ "x": 0, "y": 0 }, { "x": 280, "y": 160 }], // 相对 x/y
        "data": { "width": 26 }
      }
    ]
  }
}
```

元素类型（13 类）：`settlement` 聚落、`character` 角色/NPC、`stronghold` 重要据点、`building` 建筑、`region` 特殊区域、`collectible` 收集物品、`bulletin` 公告栏、`sign` 路引、`portal` 传送门、`river` 河流、`mountain` 山川、`tree` 树木、`road` 道路。

通用字段：

- 点元素：`x / y`；区域元素：`radius`；河流/道路：`points`（相对 `x/y`）+ `data.width`。
- `data` 按类型扩展；前端 `worldTypes.js` 定义默认值与分类，服务端不依赖前端字段。
- 对话：`audienceIds` 过滤可见对象；`choices[].response` 是分支回应；`quest` 挂在对话上即「任务派发」。
- 聚落：`hostile` 与 `safeZone` 独立存储；敌对聚落可在 UI 上强制取消安全区，但数据结构不隐式推导，便于表达「敌对但暂时停战」等状态。
- 引用：`characterId` 指向 `characters[].id`；`narrativeNodeId` 指向 `narrative.nodes[].id`；`portal.targetId` 指向其他元素 id。
- 体检（`world.js`）会检查：重复/缺失坐标、角色与剧情节点引用、空对话、空任务目标、聚落敌对 + 安全区冲突、传送门目标、收集物数量、路径点数量等。

### 2.6 画布撤销 / 重做

前端 `World.vue` 维护一个**元素快照栈**（最多 60 步），覆盖画布上的所有写操作：

- 深层 watch `world.elements` → 400ms 防抖合并连续输入（例如逐字改名）。
- 添加、删除、拖动、绘制路径、检查器字段修改都会进入同一快照栈。
- 撤销/重做前先 flush 待提交快照，避免漏掉最后一次编辑；恢复快照会替换整个 `elements` 数组并触发防抖保存。
- 按钮：工具栏 `↶ / ↷`；快捷键：`Ctrl/⌘ + Z` 撤销，`Ctrl/⌘ + Shift + Z` 或 `Ctrl/⌘ + Y` 重做（输入框内保留浏览器原生撤销）。
- 快照使用 JSON 深拷贝而不是 `structuredClone`，因为元素对象来自 Vue 响应式代理。

## 3. 引擎接口

### `expr.js`

```js
evaluate(expr, ctx)          // 求值，失败抛出带位置信息的错误
check(expr, ctx)             // { ok, value } / { ok:false, error }
variablesOf(expr)            // 标识符列表（含对象根，如 "flags"）
BUILTIN_FUNCTIONS            // min/max/clamp/abs/round/floor/ceil/sqrt/pow/log/sign/if/has/len
```

### `stats.js`

```js
deriveAll(project, character, level) // { values, order, metrics, errors, warnings, level }
curve(project, character, maxLevel)  // { rows, anomalies }
validateAttribute(attr, project)     // string[] 错误
```

### `combat.js`

```js
simulate(a, b, config)      // 蒙特卡洛汇总
resolveBattle(a, b, cfg, seed) // 单场（含日志）
matrix(units, config)       // 两两胜率
levelSweep(aFactory, dummy, levels) // 等级曲线
```

战斗输入：`{ id, name, stats, skills }`；技能 `{ power, hits, critBonus, cooldown, weight, type }`。

### `branch.js`

```js
analyze(narrative, options) // { summary, issues, reachability, paths, endingStats, flags, cycles, deadEnds, hubs, branchEntropy, tensionProfile, nodes, edges }
simulateRoute(narrative, edgeIds) // 逐步演算（旗标、被拦截原因、可选分支）
```

### `infer.js`

```js
runInference(caseData, options) // { fired, facts, ranking, hints, contradictions, verdict, coverage, explain }
```

### `blueprint.js`

```js
buildBlueprint(project, branchResult) // { acts, tensionCurve, keyBeats, routeTable, arcs, numericAnchors, world, warnings, markdown }
generateMarkdown(project, blueprint)
```

### `world.js`

```js
analyzeWorld(project) // { summary, warnings, settlements, quests, dialogues, portals, charactersOnMap, charactersNotOnMap, bounds }
```

`summary` 含元素分类计数、聚落（安全/敌对/中立）、对话数（含特定对象）、任务数、传送门可用数、地图范围与错误/警告计数；蓝图会引用该结果生成「开放世界摘要」章节。

## 4. MCP 层

`mcp/` 是一个零第三方依赖的 MCP stdio 服务，协议层与业务层分离：

```text
mcp/server.mjs   JSON-RPC 2.0 stdio：initialize / tools/list / tools/call / ping
mcp/tools.mjs    12 个工具定义 + 参数校验 + 元素/对话/任务规范化
mcp/api.mjs      本地 REST 客户端，读-改-写、409 重试、项目解析
```

设计：

- **不绕过 API**：MCP 不直接写 `data/`，而是调用 `/api/projects` 与 `/api/engine/*`，复用 revision 冲突检测。
- **写操作串行化**：服务内部用 Promise 队列串行处理 `tools/call`，避免同一进程内并发写。
- **自动重试**：每个写工具读取最新 revision、修改、PUT；遇到 409 自动重读并重试一次，仍冲突则把可操作的错误返回给模型。
- **零依赖**：手写换行分隔 JSON-RPC，无需安装 MCP SDK；stdout 只输出协议消息，日志走 stderr。
- **工具语义**：`world_add_element` / `world_update_element` / `world_remove_element` 覆盖通用元素；`world_set_settlement` 与 `world_set_npc_dialogue` 提供聚落状态、特定对话、分支、任务的语义化快捷入口；`world_analyze` / `blueprint_markdown` 只读。
- **约束**：本地 API 必须先运行；坐标是无限世界坐标；路径入参为绝对坐标，落盘为相对 `x/y` 的控制点。



## 5. 保存协议

- 页面每次编辑触发深度 watch → 650ms 防抖 → `PUT /api/projects/:id`。
- 请求带 `baseRevision`；该企划的 revision 不匹配返回 `409` 与当前 revision，前端提示并重新加载，避免覆盖。
- 服务端写入流程：写 `<id>.json.tmp` → `rename` 原子替换，保证崩溃时不产生半截文件。
- 切换企划前会先 flush 当前企划的未保存修改，再加载目标企划。
- 引擎调用前调用 `ensureSaved()`，保证「刚改完就演算」不会读到旧快照。
- 新建企划：`blankProject()` 带通用属性/技能/战斗预设、一个初始角色、一个开场节点与空世界；也可用 `template:"clone"` 复制现有企划。
- 演示数据重建：`POST /api/demo/reset`（演示企划专属按钮）。
- 迁移：首次启动若 `data/projects/` 为空但存在旧 `data/project.json`，会自动迁移为 `proj-mist-harbor.json`。

## 6. 扩展点

| 需求 | 建议改动 |
| --- | --- |
| 企划分组 / 归档 | 在 `store.js` 列表层增加 tag/archived 字段，配合前端的项目菜单过滤 |
| 自定义模块组合 | 把 `meta.modules` 从开关升级为带配置的模块声明（如「无战斗」模板） |
| 协作 | 在 PUT 上增加字段级合并或 CRDT；当前每企划 revision 适合单人/小团队 |
| 试玩模式 | 前端新增 `PlayView`，复用 `branchRoute` 按玩家选择推进 |
| 状态效果 | 扩展 `combat.js` 的 combatant 状态机（护盾/持续伤害/控制），技能加 `effects` |
| 案件编辑器 | 推理页增加规则表单，复用 `validateAttribute` 类似的语法校验 |
| 大地图运行时 | 用 `portals`/`road` 建图做寻路与旅行时间；元素坐标可导出到 Unity/Godot 场景 |
| 对话运行时 | 将 `dialogues` 导出为对话树（Yarn/Ink），`audienceIds` 映射为条件函数 |
| 导出 PDF/PPT | 基于 `blueprint.markdown` 接 Markdown→PDF，或直接生成结构化 JSON 给设计工具 |
