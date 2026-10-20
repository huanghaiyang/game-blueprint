# Game Story MCP

零第三方依赖的 **MCP stdio 服务**，把 Game Story Studio 的本地 API 暴露给 DSH、Claude Code、Cursor 等 harness。模型可以直接读取/修改企划、世界地图、聚落状态、NPC 对话与任务。

## 前置条件

1. Node.js ≥ 18（推荐 22）。
2. Game Story API 正在运行：

```bash
cd D:/path/to/game-story
npm start          # http://127.0.0.1:3087
# 或 npm run dev
```

MCP 进程只负责调用 REST API，**不会自己启动 Web 服务**。API 不可达时工具会返回明确提示。

## harness 配置

把下面一段加入 harness 的 MCP server 配置（字段名以 harness 为准）：

```json
{
  "mcpServers": {
    "game-story": {
      "command": "node",
      "args": ["D:/path/to/game-story/mcp/server.mjs"],
      "env": {
        "GAME_STORY_API": "http://127.0.0.1:3087"
      }
    }
  }
}
```

也可以直接验证 stdio 服务：

```bash
npm run mcp
```

然后用 JSON-RPC 行协议发送 `initialize` / `tools/list` / `tools/call`。

## 工具

| 工具 | 读写 | 作用 |
| --- | --- | --- |
| `api_status` | 读 | 检查 API、列出企划数量 |
| `project_list` | 读 | 列出企划 id / 名称 / 计数 |
| `project_get` | 读 | 企划摘要（模块、角色、节点、世界）；`includeFull` 可取完整 project |
| `world_get` | 读 | 完整世界数据 + 角色/剧情索引；`includeAnalysis` 附带体检 |
| `world_list_elements` | 读 | 按类型/名称过滤元素，拿 `elementId` |
| `world_add_element` | 写 | 添加 13 类元素之一（点/区域/河流道路路径） |
| `world_update_element` | 写 | 改名称、坐标、颜色、半径、路径，浅合并 `data` |
| `world_remove_element` | 写 | 删除元素 |
| `world_set_settlement` | 写 | 设置聚落敌对/安全区/增益/阵营/人口/服务 |
| `world_set_npc_dialogue` | 写 | 给 NPC 添加/替换对话，含特定对象、分支选项、任务派发 |
| `world_analyze` | 读 | 世界体检：引用、空对话、冲突、传送门 |
| `blueprint_markdown` | 读 | 生成含开放世界摘要的蓝图 Markdown |

### 常用示例

```json
{ "projectId": "proj-mist-harbor" }
```

添加一个安全区聚落：

```json
{
  "type": "settlement",
  "x": -300, "y": 500,
  "name": "南岸集市",
  "radius": 240,
  "data": {
    "faction": "商会",
    "population": 640,
    "hostile": false,
    "safeZone": true,
    "buffs": [{ "name": "集市折扣", "desc": "商店价格 -10%" }],
    "services": ["商店", "任务"]
  }
}
```

把聚落改成敌对：

```json
{ "elementId": "w-set-oldtown", "hostile": true }
```

给白鹭添加一段只对沈砚开放的对话，并派发任务：

```json
{
  "elementId": "w-char-bailu",
  "name": "只对沈砚说的话",
  "audience": ["沈砚"],
  "lines": [
    { "speaker": "白鹭", "text": "第三封信不是写给你的。" },
    { "speaker": "沈砚", "text": "那是写给谁的？" }
  ],
  "choices": [
    { "label": "继续追问", "response": "去钟楼，问阿禾。" }
  ],
  "quest": {
    "title": "钟楼的回信",
    "summary": "去钟楼集确认第三封信的收信人。",
    "objectives": ["前往钟楼集", "与阿禾交谈"],
    "reward": "钟楼钥匙",
    "status": "未接取"
  }
}
```

绘制河流：

```json
{
  "type": "river",
  "x": -1200, "y": 400,
  "name": "南河",
  "points": [
    { "x": -1200, "y": 400 },
    { "x": -900, "y": 480 },
    { "x": -600, "y": 700 }
  ],
  "data": { "width": 24 }
}
```

## 已接入 DSH（本机）

仓库内 [harness/game-story-mcp](../harness/game-story-mcp) 是一个 **configuration-only Cordis bundle**，已通过 `plugin_manager install_bundle` 接入当前 `web` profile：

- `serverName`：`game-story`，工具名前缀 `mcp__game-story__*`
- 传输：`stdio`，命令 `C:/Program Files/nodejs/node.exe`，参数 `D:/sgames/game-story/mcp/server.mjs`
- 环境：`GAME_STORY_API=http://127.0.0.1:3087`
- 验证：调用 `mcp__game-story__api_status` 或 `mcp__game-story__world_analyze`

如果仓库换了位置，修改 [cordis.patch.yml](../harness/game-story-mcp/cordis.patch.yml) 里的 `args` / `cwd`，然后重新安装该 bundle。`harness/` 下的 bundle 只负责接入，不包含游戏代码。

## 语义与约束

- **写入立即落盘**：每个写工具都会读取最新 revision、修改、PUT 保存，返回新的 `revision`。
- **revision 冲突**：若 Web 页面同时编辑同一企划，MCP 遇到 409 会自动重读重试一次；仍冲突时应重新读取再操作。
- **坐标**：世界坐标无边界；路径 `points` 在 MCP 入参里是绝对坐标，落盘为相对元素 `x/y` 的控制点。
- **聚落状态**：`hostile` 与 `safeZone` 独立；最终同时为 true 时自动取消安全区（返回结果会反映最终状态）。
- **对话可见对象**：`audience` 传角色名或角色 id；空数组/省略 = 所有人。未知角色会在错误里列出可用角色。
- **任务**：挂在对话上，`objectives` 支持字符串或 `{text,done}`；`status` 仅限 未接取/进行中/已完成/已失败。
- **安全**：服务默认只连接 `127.0.0.1`；MCP 拥有修改本地企划的权限，不要把此服务暴露到公网。
