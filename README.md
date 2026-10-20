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

当前使用 OpenAI gpt-4.1，经 /v1/chat/completions 完成两阶段请求：关键词 ID 分类，再生成策略；最后按输入数据校验 ID、指标及章节边界。不是 Claude，也没有 GPT-4o 回退。补齐 Gap 后可能增加输入 token 和耗时。

分类阶段使用严格 JSON Schema，并按实际送入的关键词数调整输出上限（最少 5,000，最多 32,768 token）。解析前检查完成状态；输出截断、拒绝、结构错误、未知 ID、遗漏 ID 或分类冲突会返回具体错误并停止策略生成，不自动重试。失败日志只记录响应 ID、模型、完成原因、输入数量和 token 用量等诊断信息。较大的输出上限只提供容量，实际费用和耗时取决于实际生成量。

支持 CSV、XLSX 多工作表及粘贴行，最多 5 个来源分区。必需 Keyword 和 Volume，支持 KD、Intent/Intents、CPC、Competition Density、Trend、SERP Features 及竞品网址排名列。请明确选择来源角色，尤其是 Current Page / Competitor Gap。

## 本地开发

安装依赖后，在未提交的 .env.local 中配置 OPENAI_API_KEY、TOOL_PASSWORD、ADMIN_PASSWORD；如需持久保存管理员提示词及品牌范围，配置 KV_REST_API_URL 和 KV_REST_API_TOKEN（Upstash Redis）。不要提交密钥。

~~~powershell
npm install
npm run dev
~~~

访问 http://localhost:3000。没有 Redis 时生成使用默认提示词；管理员设置的持久保存需要 Redis。实际请求入口保持原版行为。

## 验证

~~~powershell
node --test tests/keyword-gap.test.cjs tests/classification.test.cjs
npm run build
~~~

测试使用模拟 OpenAI 响应，不消耗 token，检查选择边界、Gap 补齐与去重证据、两个 AI 阶段及超限输入拦截。

## Git 提交范围与上线

本次提交仅整理已验证的最小关键词逻辑、来源覆盖 UI、中文说明及回归测试。保留已有登录和部署机制。

独立本地实验中的运行次数许可、5 美元累计预估费用停止条件、本机文件历史、token 记录及本地下载页面不属于本次移植；不能把实验目录直接当作生产应用部署。当前 Git 应用并未因此获得生产持久历史和 token 计费功能。

先推送功能分支并查看预览，再合并上线。若 Git 主分支连接了自动部署，直接推送主分支可能触发发布。不要提交 .env.local、实验授权文件、原始输入数据或运行记录。

原有 lib/markdownReport.ts 有独立未提交修改；本次不改写、不纳入提交。该修改引用缺失的 strategyTypes，可能导致当前混合工作区构建失败。可提交本次明确列出的文件后，在干净工作树中构建已提交版本；不要为了通过构建丢弃原有修改。
