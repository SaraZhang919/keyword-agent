type KeywordLike = {
  keyword_id?: string
  keyword?: string
  volume?: number
  kd?: number
  kd_tag?: string
  intent?: string
  trend_direction?: string
  cpc?: number
  density?: number
  source?: string
  source_role?: string
  content_placement?: string
  flag?: string | null
  use_case?: string
  serp_features?: string
  content_format?: string
  note?: string
  reason?: string
  validated?: boolean
  combined_signal?: string
  competitor_brand?: string | null
  opportunity?: string
}

type PageStrategyNotes = {
  content_format?: string
  biggest_opportunity?: string
  primary_risk?: string
}

type NewPageOpportunity = {
  page_title?: string
  page_type?: string
  primary_keyword_id?: string
  primary_keyword?: string
  primary_keyword_volume?: number
  primary_keyword_kd?: number
  supporting_keywords?: string[]
  intent?: string
  content_format?: string
  why_new_page?: string
  product_or_function_idea?: string
  priority?: string
  difficulty_note?: string
  source?: string
  source_role?: string
}

type DataAudit = {
  unsupported_ai_suggestions?: {
    section?: string
    keyword_id?: string | null
    keyword?: string | null
    reason?: string
  }[]
  metric_corrections_applied?: {
    section?: string
    keyword?: string
    reason?: string
  }[]
}

type ArticleIdeaExpansion = {
  article_title?: string
  target_audience?: string
  source_keyword_or_topic?: string
  recommended_content_type?: string
  content_angle?: string
  why_this_audience_needs_it?: string
  pain_points?: string[]
  trigger_moment?: string
  current_workaround?: string
  better_solution_angle?: string
  suggested_outline?: string[]
  trust_or_proof_needed?: string
  product_connection?: string
  priority?: string
}

type MissingExport = {
  topic?: string
  reason?: string
}

type StrategyReport = {
  primary_keyword?: KeywordLike
  supporting_keywords?: KeywordLike[]
  longtail_keywords?: KeywordLike[]
  competitor_insights?: KeywordLike[]
  excluded_keywords?: KeywordLike[]
  missing_exports?: MissingExport[]
  page_strategy_notes?: PageStrategyNotes | string
  new_page_opportunities?: NewPageOpportunity[]
  article_idea_expansions?: ArticleIdeaExpansion[]
  data_audit?: DataAudit
}

type Stats = {
  total?: number
  afterVolumeFilter?: number
  afterDedup?: number
  sentToAI?: number
}

function cell(value: unknown): string {
  if (value === undefined || value === null || value === '') return '-'
  if (typeof value === 'number') return value.toLocaleString()
  return String(value).replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim() || '-'
}

function paragraph(value: unknown): string {
  if (value === undefined || value === null || value === '') return '-'
  return String(value).trim()
}

function table(headers: string[], rows: unknown[][]): string {
  if (!rows.length) return '_None._\n'
  const header = `| ${headers.map(cell).join(' |')} |`
  const divider = `| ${headers.map(() => '---').join(' |')} |`
  const body = rows.map(row => `| ${row.map(cell).join(' |')} |`)
  return [header, divider, ...body].join('\n') + '\n'
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'analysis'
}

export function getMarkdownReportFilename(result: StrategyReport): string {
  const primary = result.primary_keyword?.keyword || 'analysis'
  const date = new Date().toISOString().slice(0, 10)
  return `keyword-strategy-${slugify(primary)}-${date}.md`
}

export function formatMarkdownReport(result: StrategyReport, stats?: Stats | null): string {
  const primary = result.primary_keyword
  const notes = result.page_strategy_notes
  const lines: string[] = [
    '# Keyword Strategy Report',
    '',
    `Generated: ${new Date().toLocaleString()}`,
    '',
  ]

  if (stats) {
    lines.push('## Analysis Stats', '')
    lines.push(table(
      ['Input Keywords', 'After Volume Filter', 'After Dedup', 'Sent to AI'],
      [[stats.total, stats.afterVolumeFilter, stats.afterDedup, stats.sentToAI]]
    ))
  }

  lines.push('## Primary Keyword', '')
  if (primary) {
    lines.push(table(
      ['ID', 'Keyword', 'Volume', 'KD', 'Tag', 'Intent', 'Trend', 'Source Role', 'Source', 'Validated'],
      [[
        primary.keyword_id,
        primary.keyword,
        primary.volume,
        primary.kd,
        primary.kd_tag,
        primary.intent,
        primary.trend_direction,
        primary.source_role,
        primary.source,
        primary.validated === undefined ? '-' : primary.validated ? 'Yes' : 'No',
      ]]
    ))
    if (primary.combined_signal) lines.push(`**Signal:** ${paragraph(primary.combined_signal)}`, '')
    if (primary.note) lines.push(`**Note:** ${paragraph(primary.note)}`, '')
  } else {
    lines.push('_None._', '')
  }

  lines.push('## Page Strategy Notes', '')
  if (typeof notes === 'string') {
    lines.push(paragraph(notes), '')
  } else if (notes) {
    lines.push(`**Content Format:** ${paragraph(notes.content_format)}`, '')
    lines.push(`**Biggest Opportunity:** ${paragraph(notes.biggest_opportunity)}`, '')
    lines.push(`**Primary Risk:** ${paragraph(notes.primary_risk)}`, '')
  } else {
    lines.push('_None._', '')
  }

  lines.push('## New Page Opportunities', '')
  lines.push(table(
    ['Page Title', 'Type', 'Primary ID', 'Primary Keyword', 'Volume', 'KD', 'Intent', 'Priority', 'Content Format'],
    (result.new_page_opportunities ?? []).map(item => [
      item.page_title,
      item.page_type,
      item.primary_keyword_id,
      item.primary_keyword,
      item.primary_keyword_volume,
      item.primary_keyword_kd,
      item.intent,
      item.priority,
      item.content_format,
    ])
  ))
  for (const item of result.new_page_opportunities ?? []) {
    lines.push(`### ${paragraph(item.page_title || item.primary_keyword || 'Page Opportunity')}`, '')
    if (item.supporting_keywords?.length) {
      lines.push(`**Supporting Keywords:** ${item.supporting_keywords.map(cell).join(', ')}`, '')
    }
    if (item.why_new_page) lines.push(`**Why New Page:** ${paragraph(item.why_new_page)}`, '')
    if (item.product_or_function_idea) lines.push(`**Product/Function Idea:** ${paragraph(item.product_or_function_idea)}`, '')
    if (item.difficulty_note) lines.push(`**Difficulty Note:** ${paragraph(item.difficulty_note)}`, '')
  }

  lines.push('## Article Idea Expansions', '')
  lines.push(table(
    ['Article Title', 'Audience', 'Source', 'Content Type', 'Priority', 'Content Angle'],
    (result.article_idea_expansions ?? []).map(item => [
      item.article_title,
      item.target_audience,
      item.source_keyword_or_topic,
      item.recommended_content_type,
      item.priority,
      item.content_angle,
    ])
  ))
  for (const item of result.article_idea_expansions ?? []) {
    lines.push(`### ${paragraph(item.article_title || item.source_keyword_or_topic || 'Article Idea')}`, '')
    lines.push(`**Target Audience:** ${paragraph(item.target_audience)}`, '')
    if (item.why_this_audience_needs_it) lines.push(`**Why This Audience Needs It:** ${paragraph(item.why_this_audience_needs_it)}`, '')
    if (item.pain_points?.length) lines.push(`**Pain Points:** ${item.pain_points.map(cell).join('; ')}`, '')
    if (item.trigger_moment) lines.push(`**Trigger Moment:** ${paragraph(item.trigger_moment)}`, '')
    if (item.current_workaround) lines.push(`**Current Workaround:** ${paragraph(item.current_workaround)}`, '')
    if (item.better_solution_angle) lines.push(`**Better Solution Angle:** ${paragraph(item.better_solution_angle)}`, '')
    if (item.suggested_outline?.length) lines.push(`**Suggested Outline:** ${item.suggested_outline.map(cell).join(' / ')}`, '')
    if (item.trust_or_proof_needed) lines.push(`**Trust/Proof Needed:** ${paragraph(item.trust_or_proof_needed)}`, '')
    if (item.product_connection) lines.push(`**Product Connection:** ${paragraph(item.product_connection)}`, '')
  }

  lines.push('## Supporting Keywords', '')
  lines.push(table(
    ['ID', 'Keyword', 'Volume', 'KD', 'Tag', 'Trend', 'Intent', 'Source Role', 'Placement', 'Flag'],
    (result.supporting_keywords ?? []).map(item => [
      item.keyword_id,
      item.keyword,
      item.volume,
      item.kd,
      item.kd_tag,
      item.trend_direction,
      item.intent,
      item.source_role,
      item.content_placement,
      item.flag,
    ])
  ))

  lines.push('## Longtail Keywords', '')
  lines.push(table(
    ['ID', 'Keyword', 'Volume', 'KD', 'Tag', 'Trend', 'Source Role', 'SERP', 'Content Format', 'Use Case'],
    (result.longtail_keywords ?? []).map(item => [
      item.keyword_id,
      item.keyword,
      item.volume,
      item.kd,
      item.kd_tag,
      item.trend_direction,
      item.source_role,
      item.serp_features,
      item.content_format,
      item.use_case,
    ])
  ))

  lines.push('## Competitor Insights', '')
  lines.push(table(
    ['ID', 'Keyword', 'Volume', 'KD', 'Source Role', 'Source', 'Competitor Brand', 'Opportunity'],
    (result.competitor_insights ?? []).map(item => [
      item.keyword_id,
      item.keyword,
      item.volume,
      item.kd,
      item.source_role,
      item.source,
      item.competitor_brand,
      item.opportunity,
    ])
  ))

  lines.push('## Missing Exports', '')
  lines.push(table(
    ['Topic', 'Reason'],
    (result.missing_exports ?? []).map(item => [item.topic, item.reason])
  ))

  lines.push('## Excluded Keywords', '')
  lines.push(table(
    ['Keyword', 'Reason'],
    (result.excluded_keywords ?? []).map(item => [item.keyword, item.reason])
  ))

  const unsupported = result.data_audit?.unsupported_ai_suggestions ?? []
  const corrections = result.data_audit?.metric_corrections_applied ?? []
  if (unsupported.length || corrections.length) {
    lines.push('## Data Audit', '')
    if (unsupported.length) {
      lines.push('### Unsupported AI Suggestions', '')
      lines.push(table(
        ['Section', 'Keyword ID', 'Keyword', 'Reason'],
        unsupported.map(item => [item.section, item.keyword_id, item.keyword, item.reason])
      ))
    }
    if (corrections.length) {
      lines.push('### Metric Corrections Applied', '')
      lines.push(table(
        ['Section', 'Keyword', 'Reason'],
        corrections.map(item => [item.section, item.keyword, item.reason])
      ))
    }
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n')
}

export function downloadMarkdownReport(result: StrategyReport, stats?: Stats | null): void {
  const report = formatMarkdownReport(result, stats)
  const blob = new Blob([report], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = getMarkdownReportFilename(result)
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
