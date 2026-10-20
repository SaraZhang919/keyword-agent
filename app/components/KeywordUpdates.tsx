export default function KeywordUpdates() {
  return <section lang="zh-CN" aria-label="关键词处理更新说明" style={{padding:20,marginBottom:20,border:'1px solid var(--accent)',borderRadius:6,lineHeight:1.9,color:'var(--text-dim)',fontSize:13}}>
    <h2 style={{color:'var(--accent)',fontSize:16}}>本次更新：保留原版分析，补齐竞品 Gap</h2>
    <p>保留原版结果布局、搜索量 ≥30 过滤、关键词标准化后精确去重、指标优先级和两阶段分析。使用 OpenAI gpt-4.1：先进行关键词 ID 相关性分类，再结合分类与原始指标生成策略。没有增加“原始／手动清理”模式，也不使用此前实验版的额外语义筛选规则。</p>
    <h3>Broad 词表越大，不代表结果越好</h3>
    <p>原版按搜索量、来源角色和长尾信号共选最多 500 个关键词。大量无关词可能占用名额，让相关的低搜索量词未进入 AI，也可能增加语义噪声。建议上传前手动删除与本页功能、转换方向、用户任务明显无关的 Broad 词，保留相关的近义词、问句和长尾变体；不要只因搜索量低就删掉相关词。</p>
    <p>建议尽量控制在 <strong>500 个有效唯一 Broad 词以内</strong>。有效唯一词指搜索量 ≥30、跨文件标准化去重后的数量，并非 Excel 总行数。500 个原版名额与 Gap、Cluster 和 Custom 来源共用，因此 Broad 少于 500 也可能被截断，应以来源覆盖数为准。即使未截断，过于杂乱的词表也可能影响推荐质量。</p>
    <h3>竞品 Gap 如何进入分析</h3>
    <p>在原版预选完成后，单独补齐所有有效唯一竞品 Gap 词，不挤占原有入选词。所有 Gap 分区合计最多 700 个有效唯一词；超过时会在 AI 调用前提示缩减，不会静默裁掉。默认总输入最多为 500 个原版预选词加 700 个补齐词，重复词只计一次。</p>
    <p>请把竞品文件的 Source Role 设为 Current Page / Competitor Gap。去重仍采用原版指标优先级，同时保留竞品来源、网址和正数排名证据，支持 Intents 与 Competition Density 表头。即使同一个词最终采用 Broad 指标，竞品证据仍会进入两个 AI 阶段。网址排名不等于关键词一定是品牌词，也不证明产品具备某项能力。</p>
    <h3>如何阅读结果与排查遗漏</h3>
    <p>在最终推荐前查看 Source coverage：Broad 和 Gap 分别显示“送入 AI／有效唯一词”。如出现截断提醒，先清理 Broad 的无关词再重跑。原版名额可能包含 Cluster 和 Custom，不能把这些来源的数量都算作 Broad。</p>
    <p>送入 AI 不等于必定推荐。模型还会判断当前页相关性、竞品／导航意图及新页面价值；品牌词可能进入 Competitor Insights，也可能因不相关而不推荐。Excluded Keywords 仅解释部分代表性排除项，并非所有词的完整去向。补齐 Gap 能避免输入阶段漏词，但不能保证每次输出都包含某个指定词。</p>
    <p>补齐后输入可能超过原版 500 词，token 消耗与耗时可能增加。请用相同页面类型、主关键词和其他输入比较清理前后的结果，再人工确认业务相关性。</p>
  </section>
}
