# 价格数据源可行性探测（spike）

- Agent：zcode
- 时间：2026-08-23T21:54:57+08:00
- 状态：完成
- 任务：实验验证「获取物价」的可行性与备用数据源，为 `quote_ingredient_prices` 的 provider 实现选型提供依据。纯探测任务，除本记录外未修改仓库文件。

## 实验结论

三个批发价格源实测可用，可构成「城市 → 第二城市 → 全国基准」三级 provider 链，与 PRD V0.2 §10.2 架构直接对应。

### 源 1：北京新发地批发市场（主力，全品类）

- 端点：`POST http://www.xinfadi.com.cn/getPriceData.html`（form-urlencoded）
- 参数：`limit`、`current`、`prodName`（品名模糊匹配）、`prodCatid`（类目 ID）
- 响应：`lowPrice/highPrice/avgPrice`（天然区间）、`prodCat/prodPcat`（两级类目）、`place`（产地）、`specInfo`（规格）、`unitInfo`（单位，多为「斤」）、`pubDate`
- 类目：蔬菜 1186、粮油 1188、肉禽蛋 1189、水产 1190、豆制品 1203、调料 1204
- 更新频率：蔬菜/肉蛋日更（当天可见）、水产约隔日、粮油/调料约每 3 天
- 稳定性：无鉴权、无需伪装 UA，15 连发全部 200、无限流
- 限制：仅 HTTP（HTTPS SSL 握手失败）；服务端日期过滤参数（`pubDateStartTime/EndTime`）实测失效，默认结果按最新日期排序，需客户端过滤

### 源 2：广州江南果菜批发市场（第二城市，仅蔬果）

- 端点：`GET http://www.jnmarket.net/api/curdailypricelist`（无参数，返回当日全表）；另有 `GET /api/dailypricelist`（参数格式未明，实测传 date 返回空）
- 来源方式：从前端 SPA 的 JS 包（`/assets/priceApi-1X1FuU9C.js`）逆向
- 响应：`topPrice/minimumPrice/averagePrice`、`provenanceName`（产地，如「宁夏/云南/甘肃」）、`sourceType`（国产/进口）、`priceDate`，当日 19 点左右更新
- 覆盖：实测当日 158 个品项（`kind=1` 蔬菜 114、`kind=2` 水果 44）；无肉蛋水产粮油
- 单位：响应无单位字段，用菜心与新发地交叉验证（江南 5–7 vs 新发地 3.0–3.5 元/斤 = 6–7 元/公斤）确认为**元/公斤**
- 稳定性：无鉴权，`Referer: http://www.jnmarket.net/` 下直连可用

### 源 3：农业农村部全国批发均价（benchmark 数据来源）

- 端点：`POST https://pfsc.agri.cn/api/FarmDaily/list`（JSON，`limit/current`）
- 来源方式：从 SPA chunk 逆向；静态资源需带 `Referer: https://pfsc.agri.cn/`，否则 403
- 响应：按日一条记录，字段 `counclesion`（200 指数）、`animalConclusion`（猪肉/牛肉/羊肉/鸡蛋/白条鸡）、`aquaticConclusion`（鲫鱼/鲤鱼/白鲢鱼/大带鱼）、`vegetablesConclusion`、`fruitsConclusion`
- 形态：**文本结论文本**（如「猪肉平均价格为16.18元/公斤，比昨天上升0.3%」），需正则解析；单位统一元/公斤
- 更新：日更，实测滞后约 1–2 天（8 月 23 日查到最新为 8 月 21 日）
- 价值：全国基准价可自动生成/校准 PRD 的 `benchmark` provider，而非纯手工维护

### 确认不可用（本次排除）

- 武汉白沙洲（bszmarket.com）、寿光蔬菜指数（sgv-index.com）：连接超时
- 政务渠道（苏州发改委价格监测、商务部 lifefz.mofcom.gov.cn）：超时或已下线
- 京东开放价格接口 `p.3.cn/prices/mgets`：空响应，基本失效
- 京东搜索/盒马：反爬+登录态，不适合服务端自动化
- 苏州南环桥（nhqnm.com `/price/all`）、深圳海吉星（szap.com）：站点可达，接口未逆向，留作 P1 城市扩展候选

## 决定

- P0 价格 provider 组合：新发地（北京主力）→ 江南（广州+蔬果交叉校验）→ 农业农村部全国价（benchmark 校准与兜底）→ 手工基准 → 未知。
- 实施前置两个数据资产：每源一份「标准食材 ID → 源品名+规格」映射表；单位归一化表（斤/公斤/桶/筐混用）。
- 批发价与零售价差异的处理方式留待 MCP 工程计划时定（如实标注批发价，或维护分品类加价系数并披露）。

## 验证

- 新发地：`curl -s -X POST http://www.xinfadi.com.cn/getPriceData.html -d "limit=5&current=1&prodName=白菜"` 等：通过，当日蔬菜/肉/蛋/水产/粮油/调料均有数据。
- 新发地限流：15 连发 `curl` 循环：通过，全部 200，平均 2.3s/次。
- 新发地 HTTPS：`curl https://www.xinfadi.com.cn/getPriceData.html`：失败（exit 35，SSL 握手错误）。
- 江南市场：`curl http://www.jnmarket.net/api/curdailypricelist -H "Referer: http://www.jnmarket.net/"`：通过，当日 158 项；单位经菜心交叉验证为元/公斤。
- 农业农村部：`curl -X POST https://pfsc.agri.cn/api/FarmDaily/list -d '{"limit":1,"current":1}'`：通过，含肉蛋鱼全国均价与蔬果结论字段。
- 交叉验证基准：新发地菜心 3.0–3.5 元/斤（2026-08-21）vs 江南菜心 5–7（当日）：量级吻合（×2 关系成立）。

## 遗留

- 三个源均为「页面背后的数据通道」，无官方 API 条款与 SLA，接口可能随时变更：provider 需契约测试 + 探活监控 + benchmark 兜底（PRD 已有此要求）。
- 江南市场 `dailypricelist`（历史日期）参数格式未破解；P0 用 `curdailypricelist` + 自建缓存即可。
- 酱油、醋等瓶装调味品三个源均无数据：走 benchmark 手工价或标记未知。
- pfsc 文本解析器的正则需覆盖可变表述（「比昨天/比上周五」），建议带契约测试。
- 商用前需再确认各源数据的使用授权边界；P0 实验/小范围使用风险低。
