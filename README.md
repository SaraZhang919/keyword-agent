# Keyword Strategy Agent

内部 SEO 关键词策略工具。中文用户指南位于 /help，管理员逻辑说明位于 /guide。

## 本次确认的最小更新

- 保留原版结果布局、搜索量 ≥30 过滤、标准化精确去重、指标优先级和两阶段分析。
- 原版最多 500 个预选名额仍由所有来源共用。预选后补齐所有有效唯一 Competitor Gap 词，不挤占原有入选词。
- 所有 Gap 分区合计最多 700 个有效唯一词；超出时在 AI 请求前返回明确错误。默认总输入最多 1,200 词，重复词只算一次。
- 保留去重前的竞品来源、网址和正数排名证据；支持 Intents 与 Competition Density 列。两个 AI 阶段都会收到这些证据和 Gap 审查说明，包括使用已保存自定义策略提示词时。
- 上传区域提醒 Broad 大词表的影响，结果前显示 Broad／Gap 来源覆盖和截断提醒。

## 如何准备 Broad 关键词

词表很大或包含大量无关词，会占用原版预选名额，也可能增加语义噪声，影响结果。建议先手动删除与页面功能、转换方向、用户任务无关的词，保留相关近义词、问句、长尾变体。尽量控制在 500 个有效唯一 Broad 词以内。

“有效唯一”指搜索量 ≥30 且跨文件标准化去重后的词，不是上传行数。原版 500 个名额与 Cluster、Custom 和 Gap 共用，因此 Broad 不足 500 也可能被截断；请检查 Source coverage。Gap 会单独补齐，但送入 AI 不代表一定进入最终推荐。相关品牌需求可能进入 Competitor Insights，不必成为当前页主词。

## 模型与流程

当前两个阶段均使用 OpenAI gpt-5.6-terra，明确设置 reasoning_effort=low，经 /v1/chat/completions 完成关键词 ID 分类与策略生成；最后按输入数据校验 ID、指标及章节边界。不是 Claude，也没有自动模型回退或重试。补齐 Gap 后可能增加输入 token 和耗时。

使用 max_completion_tokens 限制推理与可见输出的合计 token：分类阶段沿用按关键词数计算的 5,000–32,768 上限；策略阶段维持 8,000。low 推理也计入这些上限，不是额外的无限推理预算。输入 token 仍按上传证据量计费，本次仅切换模型与兼容参数，关键词选择和页面类型规则不变。配置依据：[模型文档](https://developers.openai.com/api/docs/models/gpt-5.6-terra)、[Chat Completions 参数](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)。

分类阶段按本次输入动态生成严格 JSON Schema：每个实际 keyword_id 都是必填属性，对应 current_page、new_page、current_and_new 或 out_of_brand 中的一个决定。服务器再转换成策略阶段使用的三个 ID 池；不再依赖模型自行列全三个数组。按实际送入的关键词数调整输出上限（最少 5,000，最多 32,768 token）。解析前检查完成状态；输出截断、拒绝、结构错误、未知 ID 或遗漏 ID 会返回具体错误并停止策略生成，不自动重试。失败日志只记录响应 ID、模型、完成原因、输入数量和 token 用量等诊断信息。较大的输出上限只提供容量，实际费用和耗时取决于实际生成量。

支持 CSV、XLSX 多工作表及粘贴行，最多 5 个来源分区。必需 Keyword 和 Volume，支持 KD、Intent/Intents、CPC、Competition Density、Trend、SERP Features 及竞品网址排名列。请明确选择来源角色，尤其是 Current Page / Competitor Gap。

## 每次分析的 Token 与费用

首页和 /tool 在分析后显示实际 API 用量：分类与策略两个阶段各自的输入、缓存读取、缓存写入、输出、推理 token，以及本次合计和预估美元费用。推理已包含在输出内，缓存读取和写入已包含在输入内，不重复计数。此功能不增加 AI 请求或自动重试。

费用采用 2026-10-20 的 gpt-5.6-terra 标准处理价格（美元/百万 token）：普通输入 2、缓存读取 0.20、缓存写入 2.50、输出 12。单次 API 请求输入超过 272,000 token 时分别采用 4、0.40、5、18；按每个阶段分别判断，不按两个阶段合计判断。计算为 `(输入 − 缓存读取 − 缓存写入) × 输入单价 + 缓存读取 × 读取单价 + 缓存写入 × 写入单价 + 输出 × 输出单价`，最后除以一百万。[价格来源](https://developers.openai.com/api/docs/models/gpt-5.6-terra)。价格是代码中有日期的快照，需要随官方价格调整；估算不含税、抵扣或账户专属价格。

即使分析因输出截断、JSON 无效等原因失败，也会保留已经收到的用量。网络失败、缺少必要用量字段或未知模型价格会显示 Unknown；已知费用小计不会冒充完整总费用。浏览器完全未收到服务器响应时，无法显示该次用量。

可通过 Download usage JSON 单独下载每次用量，包括失败的分析。成功结果的 Copy JSON 和 Markdown 报告也包含用量与费用。服务器会输出 `Keyword analysis usage:` 结构化日志（不含密钥或关键词内容）。没有新增数据库历史；页面刷新后请从已下载文件或部署平台保留的日志查找。不能据此恢复上线前未记录的旧运行费用。

## 本地开发

安装依赖后，在未提交的 .env.local 中配置 OPENAI_API_KEY、TOOL_PASSWORD、ADMIN_PASSWORD；如需持久保存管理员提示词及品牌范围，配置 KV_REST_API_URL 和 KV_REST_API_TOKEN（Upstash Redis）。不要提交密钥。

~~~powershell
npm install
npm run dev
~~~

访问 http://localhost:3000。没有 Redis 时生成使用默认提示词；管理员设置的持久保存需要 Redis。实际请求入口保持原版行为。

## 验证

~~~powershell
node --test tests/keyword-gap.test.cjs tests/classification.test.cjs tests/generation-usage.test.cjs
npm run build
~~~

测试使用模拟 OpenAI 响应，不消耗 token，检查选择边界、Gap 补齐与去重证据、两个 AI 阶段、超限输入拦截、用量计费、失败用量保留和报告导出。

## Git 提交范围与上线

保留已有登录和部署机制。用量统计覆盖两个生成阶段，并显示在成功或失败响应及结果页面中。

独立本地实验中的运行次数许可、5 美元累计预估费用停止条件、本机文件历史及本地下载页面不属于生产应用；不能把实验目录直接当作生产应用部署。本次新增单次用量和费用估算，没有新增累计预算停止条件或生产持久历史。

先推送功能分支并查看预览，再合并上线。若 Git 主分支连接了自动部署，直接推送主分支可能触发发布。不要提交 .env.local、实验授权文件、原始输入数据或运行记录。
