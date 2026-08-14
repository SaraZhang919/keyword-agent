import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: '使用指南 | Keyword Strategy Agent',
  description: 'Keyword Strategy Agent 中文使用指南、指标定义与报告解读。',
}

const cardStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  padding: '20px',
  marginBottom: '16px',
}

function Section({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} style={{ ...cardStyle, scrollMarginTop: '76px' }}>
      <h2 style={{ margin: '0 0 12px', color: 'var(--accent)', fontSize: '14px' }}>{title}</h2>
      {children}
    </section>
  )
}

function Grid({ children }: { children: ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '10px' }}>{children}</div>
}

function Item({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '4px', padding: '12px' }}>
      <strong style={{ display: 'block', color: 'var(--text)', fontSize: '12px', marginBottom: '5px' }}>{title}</strong>
      <div style={{ color: 'var(--text-dim)', fontSize: '11px', lineHeight: 1.7 }}>{children}</div>
    </div>
  )
}

const metrics = [
  ['Keyword ID', '每次分析在过滤、去重后生成的内部标识，例如 kw_0001。它不是 SEMrush ID，也不保证下次运行仍然相同。'],
  ['Volume', '上传数据中的月搜索量。它表示需求规模，不代表你一定能获得这些流量。'],
  ['KD / Keyword Difficulty', '关键词自然排名难度，通常为 0–100。本站按 DA<30 的现实情况评估：KD<40 较现实，40–80 属于中期，>80 通常不建议当前主攻。'],
  ['KD Tag', 'Priority 表示当前较现实；Mid-term 表示需要更强内容和权威；Long-term 表示当前难度很高。'],
  ['Intent', '搜索意图：Informational 信息、Navigational 导航、Commercial 商业调研、Transactional 行动/购买。页面类型必须能够满足该意图。'],
  ['CPC', '付费广告每次点击成本，来自上传文件。它可反映商业价值，但不是 SEO 难度。'],
  ['Competition / Density', '付费搜索竞争密度，通常为 0–1。它与 KD 不同：KD 是自然搜索难度，Density 是广告竞争程度。'],
  ['Trend', '根据上传的趋势序列判断 Rising、Stable、Declining；数据不足时显示 Insufficient Data。趋势只是辅助信号。'],
  ['SERP Features', '搜索结果中的 Featured Snippet、People Also Ask、AI Overview、Video 等，用于决定 FAQ、直接回答、视频或引用型内容形式。'],
  ['Source Section', '你在上传区域填写的 section 名称，用于说明关键词来自哪组数据。'],
  ['Source File', '最终保留该关键词及指标的实际上传文件名；粘贴数据会显示 Pasted input。'],
  ['Source Role', '告诉 Agent 这组数据应如何使用，不代表关键词一定会进入对应报告 Section。'],
]

const reportSections = [
  ['Primary Keyword', '当前页面最值得主攻的关键词。输入词只是候选 seed，Agent 可以用上传数据中的更好关键词替换，但必须保持相同页面任务。', '确认 Recommended Primary Keyword 是否符合产品真实功能；若显示 Replaced input，比较输入词和推荐词。'],
  ['Supporting Keywords', '适合在同一页面 H2、功能、价值主张和正文中覆盖的相关关键词。', '将 Placement 建议映射到页面结构，避免为每个 supporting keyword 单独建页。'],
  ['Longtail Keywords', '更具体的问题、场景、平台、信任或使用方式关键词。', '优先用于 FAQ、H3、步骤、use case 和直接回答。'],
  ['Page Strategy Notes', '总结推荐内容形式、最大机会和主要风险。', '把它当作内容 brief 的方向提示，再结合真实 SERP 和产品能力判断。'],
  ['New Page Opportunities', '用于 idea brainstorming：根据数据中的独立搜索任务或 cluster 激发潜在新 URL 想法。它不是经过完整市场、SERP、产品和商业评审的最终建议。', '必须由人工确认搜索意图、真实 SERP、业务相关性、产品能力、内容重复和优先级，再决定是否创建 Product、Feature、Tool、Blog、GEO、Docs 或 Comparison 页面。'],
  ['Article Idea Expansions', '用于 idea brainstorming：针对特定 Target Audience 生成文章和场景灵感。它不是已经完成事实核查、关键词验证或编辑评审的 content brief。', '只有选择具体 audience 才生成；All / Undefined 会确定跳过。使用前必须由人工检查主题价值、受众需求、事实、搜索意图、品牌适配和内容可行性。'],
  ['Competitor Insights', '品牌词、替代品、对比和迁移需求的发现区。', '可用于 alternative/comparison 内容研究，不是当前页面必须使用的关键词，也不一定每次都有。'],
  ['Missing Exports', '当前上传数据不足以验证、但可能影响结论的 topic 或 cluster。它是研究建议，不是已经确认有搜索量的关键词。', '针对该 topic 在 SEMrush 或其他工具中继续研究/导出，作为新 section 上传后重新运行；若不符合业务范围可以忽略。'],
  ['Excluded Keywords', 'Agent 主动解释的代表性未采用关键词。不会列出所有未显示的词。', '检查排除原因；若产品能力或页面意图判断有误，再调整输入、Source Role 或数据。'],
  ['Data Audit', '服务器对 AI 输出做的指标和边界校验，包括删除无来源建议、修正 ID 和安全 fallback。', '用于理解为什么某些建议被替换或补充；指标仍以上传行作为唯一来源。'],
]

export default function HelpPage() {
  return (
    <div lang="zh-CN" style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      <header style={{
        height: '52px', padding: '0 24px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg)'
      }}>
        <strong style={{ fontSize: '14px', minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>Keyword Strategy Agent · 使用指南</strong>
        <Link href="/tool" style={{ color: 'var(--accent)', fontSize: '11px', textDecoration: 'none', whiteSpace: 'nowrap', marginLeft: '16px' }}>返回工具</Link>
      </header>

      <main style={{ maxWidth: '1060px', margin: '0 auto', padding: '32px 20px 56px' }}>
        <div style={{ marginBottom: '24px' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '10px', letterSpacing: '0.08em' }}>PUBLIC USER GUIDE</div>
          <h1 style={{ margin: '8px 0', fontSize: '26px' }}>如何使用 Keyword Strategy Agent</h1>
          <p style={{ margin: 0, maxWidth: '780px', color: 'var(--text-dim)', lineHeight: 1.8, fontSize: '13px' }}>
            本工具把你上传的关键词数据转成页面级 SEO 策略：选择 Primary Keyword、组织同页关键词、发现独立新页面机会，并指出需要补充研究的数据。AI 推荐不是排名保证；所有显示的 Volume、KD、CPC 和 Competition 必须来自上传数据。
          </p>
        </div>

        <div role="note" style={{
          background: 'rgba(245, 158, 11, 0.08)', border: '1px solid var(--warn)', borderRadius: '6px',
          padding: '14px 16px', marginBottom: '16px', color: 'var(--text-dim)', fontSize: '12px', lineHeight: 1.8
        }}>
          <strong style={{ color: 'var(--warn)' }}>重要：Idea Brainstorming，不是最终审核结论。</strong><br />
          New Page Opportunities 和 Article Idea Expansions 的用途是激发新页面、内容和产品方向。它们没有完成全面的 SERP、竞争、市场需求、产品可行性、事实和品牌评审。任何建议在进入 roadmap、建页或发布前，都必须由人工进一步研究、判断和审核。
        </div>

        <Section title="五分钟使用流程">
          <ol style={{ margin: 0, paddingLeft: '20px', color: 'var(--text-dim)', lineHeight: 1.9, fontSize: '12px' }}>
            <li>选择 Page Type，确保它与准备创建或优化的 URL 类型一致。</li>
            <li>输入 Primary Keyword。它用于描述页面任务和方向，是候选 seed，不保证成为最终推荐词。</li>
            <li>只有需要 audience-specific 文章创意时才选择具体 Target Audience；选择 All / Undefined 会跳过 Article Idea Expansions。</li>
            <li>上传 CSV/XLSX 或粘贴数据，给每组数据填写清晰的 Section Label，并选择正确 Source Role。</li>
            <li>运行后先看 Primary Keyword 和 Page Strategy Notes，再看 Supporting/Longtail，最后评估 New Page、Competitor 和 Missing Exports。</li>
          </ol>
        </Section>

        <Section title="输入项与 Source Role">
          <Grid>
            <Item title="Page Type">决定合理的搜索意图、Volume 门槛和内容形式。Tool/Feature 偏商业或行动意图；Blog/Docs 偏信息意图；GEO 必须有地点意图。</Item>
            <Item title="Primary Keyword">描述当前页面的核心 object、任务和方向。Agent 可以替换它，但不能把 PDF→Markdown 换成 Markdown→PDF 这类反向任务。</Item>
            <Item title="Target Audience">只影响 Article Idea Expansions，不应改变 Primary、Supporting、Longtail、New Page 或其他分析。</Item>
            <Item title="Broad Match Keywords">当前页面 Primary、Supporting 和 Longtail 的主要测量关键词池。</Item>
            <Item title="Current Page / Competitor Gap">用于发现现有页面缺口和 competitor demand；通常不是默认 Primary target。</Item>
            <Item title="Page Cluster / Page Opportunities">主要用于识别未来独立页面、内容 cluster 和产品/功能机会。</Item>
            <Item title="Custom Keyword List">自定义或混合数据；Agent 根据关键词文本、指标和页面相关性判断。</Item>
            <Item title="Auto-detect">根据表头猜测 Source Role。若识别不正确，请在运行前手动选择。</Item>
          </Grid>
        </Section>

        <Section title="Agent 如何处理数据">
          <Grid>
            <Item title="1. Parse">读取所有有效 sheet，识别 Keyword、Volume 及可选 KD、CPC、Intent、Trend、SERP 等列。</Item>
            <Item title="2. Filter">普通关键词 Volume&lt;30 会被过滤；少量紧密的 access/trust modifier 只可作为措辞提示。</Item>
            <Item title="3. Deduplicate">相同关键词去重，保留 Volume 更高或指标更完整的行，并保留该行的 Source File。</Item>
            <Item title="4. Select up to 500">按 Volume、Source Role 和 longtail/question 信号选择最多 500 行发送给模型。</Item>
            <Item title="5. Stage 1">将 ID 分为 Current Page、New Page 和 Out of Brand；明确的反向转换不会进入 Current Page。</Item>
            <Item title="6. Stage 2 + Audit">生成策略后，服务器重新匹配 ID、恢复精确指标、移除越界建议并稳定各 Section。</Item>
          </Grid>
        </Section>

        <Section title="Metric 与字段定义">
          <Grid>{metrics.map(([title, text]) => <Item key={title} title={title}>{text}</Item>)}</Grid>
        </Section>

        <Section id="primary-keyword" title="Primary Keyword：输入词、推荐词和 Selection Status">
          <p style={{ color: 'var(--text-dim)', fontSize: '12px', lineHeight: 1.8 }}>
            Submitted Keyword 是你输入的候选词；Recommended Primary Keyword 是 Agent 在 Current Page pool 中选择的最终目标。二者可能不同。
          </p>
          <Grid>
            <Item title="Kept input">推荐词与输入词相同。</Item>
            <Item title="Replaced input">Agent 找到同一页面任务下更适合的上传关键词。请查看 Note、Volume、KD、Intent 和来源后再确认。</Item>
            <Item title="Recommended target">被选择的最终关键词通过当前策略规则。它不表示原始输入一定被保留，也不是排名保证。</Item>
            <Item title="Needs manual review">系统只能选择最佳可用 fallback，或证据不足。应检查 SERP、产品能力并补充 Missing Exports。</Item>
          </Grid>
          <p style={{ color: 'var(--text-muted)', fontSize: '11px', lineHeight: 1.8, marginBottom: 0 }}>
            转换方向属于页面任务：PDF to Markdown 与 Markdown to PDF 是不同页面。只有在 source 和 target 方向一致时，转换词才可以互相替换。方向不明确时系统不会硬猜。
          </p>
        </Section>

        <Section title="报告 Sections：是什么意思、下一步做什么">
          <div style={{ display: 'grid', gap: '10px' }}>
            {reportSections.map(([title, meaning, action]) => (
              <div key={title} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '4px', padding: '13px' }}>
                <strong style={{ color: 'var(--text)', fontSize: '12px' }}>{title}</strong>
                <p style={{ margin: '6px 0', color: 'var(--text-dim)', fontSize: '11px', lineHeight: 1.7 }}>{meaning}</p>
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '11px', lineHeight: 1.7 }}><strong>下一步：</strong>{action}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="常见问题">
          <Grid>
            <Item title="为什么输入词和 Primary Keyword 不一样？">输入词只是 candidate seed。Agent 可以在相同页面任务中选择更合适的已上传关键词；查看 Input Decision、Note 和来源。若任务或转换方向不同，则属于错误，不应替换。</Item>
            <Item title="为什么 Article Idea Expansions 没出现？">如果 Target Audience 是 All / Undefined，系统会明确跳过该 Section。请选择具体或 Custom audience 后重新运行。</Item>
            <Item title="为什么只有部分 case 有 Competitor Insights？">只有上传数据包含可识别的 competitor/brand demand 时才有内容。空白不代表分析失败。</Item>
            <Item title="Missing Exports 是 Agent 发明的关键词吗？">不是。它是“还缺哪些数据才能验证”的研究方向，不带可信的 Volume/KD。补充导出后重新运行，或在不相关时忽略。</Item>
            <Item title="Primary ID 对应哪个文件？">ID 本身只是本次分析的内部标识。请同时查看 Source Section 和 Source File；它们指出最终指标来自哪组数据和哪个实际文件。</Item>
            <Item title="为什么某些原始词没有出现在报告？">它可能被 Volume 过滤、去重、500 行预选、相关性分类或策略选择排除。Excluded Keywords 只列有代表性的原因，不列全部未使用词。</Item>
          </Grid>
        </Section>

        <div style={{ textAlign: 'center', marginTop: '24px' }}>
          <Link href="/tool" style={{ display: 'inline-block', color: '#000', background: 'var(--accent)', padding: '9px 18px', borderRadius: '4px', textDecoration: 'none', fontSize: '12px', fontWeight: 600 }}>返回工具开始分析</Link>
        </div>
      </main>
    </div>
  )
}
