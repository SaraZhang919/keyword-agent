'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { downloadMarkdownReport } from '@/lib/markdownReport'

// ─── Types ──────────────────────────────────────────────────────────────────

type Section = {
  id: number
  label: string
  role: SourceRole
  file: File | null
  paste: string
}

type SourceRole = 'auto' | 'broad_match' | 'current_page_gap' | 'page_cluster' | 'custom'

interface KeywordResult extends Record<string, unknown> {
  keyword_id?: string
  keyword: string
  volume: number
  kd: number
  kd_tag: string
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

interface PageStrategyNotes {
  content_format: string
  biggest_opportunity: string
  primary_risk: string
  low_demand_modifier_guidance?: string[]
}

interface MissingExport {
  topic: string
  reason: string
}

interface NewPageOpportunity {
  page_title: string
  page_type: string
  primary_keyword_id?: string
  primary_keyword: string
  primary_keyword_volume?: number
  primary_keyword_kd?: number
  supporting_keywords?: string[]
  intent?: string
  content_format?: string
  why_new_page?: string
  product_or_function_idea?: string
  priority?: 'High' | 'Medium' | 'Low' | string
  difficulty_note?: string
  source?: string
  source_role?: string
}

interface ArticleIdeaExpansion {
  article_title: string
  target_audience: string
  source_keyword_or_topic: string
  recommended_content_type: string
  content_angle: string
  why_this_audience_needs_it: string
  pain_points?: string[]
  trigger_moment: string
  current_workaround: string
  better_solution_angle: string
  suggested_outline?: string[]
  trust_or_proof_needed: string
  product_connection: string
  priority?: 'High' | 'Medium' | 'Low' | string
}

interface StrategyResult {
  primary_keyword: KeywordResult & { validated: boolean; note: string }
  supporting_keywords: KeywordResult[]
  longtail_keywords: KeywordResult[]
  competitor_insights: KeywordResult[]
  excluded_keywords: KeywordResult[]
  missing_exports?: MissingExport[]
  page_strategy_notes: PageStrategyNotes | string
  new_page_opportunities?: NewPageOpportunity[]
  article_idea_expansions?: ArticleIdeaExpansion[]
  data_audit?: DataAudit
}

interface DataAudit {
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

interface Stats {
  total: number
  afterVolumeFilter: number
  afterDedup: number
  sentToAI: number
  bySource?: Record<string, number>
  bySourceRole?: Record<string, number>
}

const MAX_SECTIONS = 5

const PAGE_TYPES = [
  'Feature Page',
  'Online Tool Page',
  'Blog Post',
  'GEO Page',
  'Docs Page',
]

const AUDIENCE_OPTIONS = [
  'All / Undefined',
  'Graduate students / Academic researchers',
  'Knowledge workers',
  'Solo lawyers / small law firms',
  'Accountants / AP teams',
  'Data-sensitive teams',
  'Custom audience',
]

const SOURCE_ROLE_OPTIONS: { value: SourceRole; label: string }[] = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'broad_match', label: 'Broad Match Keywords' },
  { value: 'current_page_gap', label: 'Current Page / Competitor Gap' },
  { value: 'page_cluster', label: 'Page Cluster / Page Opportunities' },
  { value: 'custom', label: 'Custom Keyword List' },
]

// ─── Sub-components ──────────────────────────────────────────────────────────

function KdTag({ tag }: { tag: string }) {
  const cls = tag === 'Priority' ? 'tag-priority' : tag === 'Mid-term' ? 'tag-midterm' : 'tag-longterm'
  return (
    <span className={cls} style={{
      border: '1px solid', borderRadius: '3px', padding: '1px 6px',
      fontSize: '10px', letterSpacing: '0.05em', whiteSpace: 'nowrap'
    }}>
      {tag}
    </span>
  )
}

function TrendBadge({ direction }: { direction?: string }) {
  if (!direction) return null
  const color = direction === 'Rising' ? 'var(--accent)' : direction === 'Declining' ? 'var(--danger)' : 'var(--text-muted)'
  const arrow = direction === 'Rising' ? '↑' : direction === 'Declining' ? '↓' : '→'
  return <span style={{ color, fontSize: '10px' }}>{arrow} {direction}</span>
}

function StatBadge({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '18px', fontWeight: '600', color: accent ? 'var(--accent)' : 'var(--text)' }}>
        {value.toLocaleString()}
      </div>
      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>{label}</div>
    </div>
  )
}

function SectionRow({
  section, index, canRemove, inputRef, onLabelChange, onRoleChange, onFileChange, onPasteChange, onRemove
}: {
  section: Section
  index: number
  canRemove: boolean
  inputRef: (el: HTMLInputElement | null) => void
  onLabelChange: (v: string) => void
  onRoleChange: (v: SourceRole) => void
  onFileChange: (f: File | null) => void
  onPasteChange: (v: string) => void
  onRemove: () => void
}) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'minmax(160px, 1fr) minmax(220px, 1fr) minmax(220px, 1.5fr) auto', gap: '10px',
      alignItems: 'center', background: 'var(--surface)',
      border: '1px solid var(--border)', borderRadius: '4px', padding: '12px 14px',
    }}>
      <input type="text" value={section.label} onChange={e => onLabelChange(e.target.value)}
        placeholder={`Section ${index + 1} name`} style={{ padding: '7px 10px', fontSize: '12px' }} />
      <select
        value={section.role}
        onChange={e => onRoleChange(e.target.value as SourceRole)}
        title="Choose how this source should influence the strategy"
        style={{ padding: '7px 10px', fontSize: '12px' }}
      >
        {SOURCE_ROLE_OPTIONS.map(option => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: '4px', padding: '6px 12px', cursor: 'pointer',
          fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap',
        }}>
          <span>↑</span>
          {section.file ? 'Change file' : 'Upload CSV / XLSX'}
          <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }}
            onChange={e => onFileChange(e.target.files?.[0] ?? null)} />
        </label>
        {section.file && (
          <span style={{ fontSize: '11px', color: 'var(--accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            ✓ {section.file.name}
          </span>
        )}
      </div>
      <button type="button" onClick={onRemove} disabled={!canRemove} style={{
        background: 'none', border: 'none',
        color: canRemove ? 'var(--text-muted)' : 'transparent',
        fontSize: '16px', cursor: canRemove ? 'pointer' : 'default', padding: '2px 4px', lineHeight: 1,
      }}>×</button>
      <textarea
        value={section.paste}
        onChange={e => onPasteChange(e.target.value)}
        placeholder="Or paste keyword rows: keyword [tab] volume [tab] KD"
        rows={3}
        style={{
          gridColumn: '2 / 5',
          width: '100%',
          padding: '8px 10px',
          fontSize: '11px',
          lineHeight: 1.5,
          resize: 'vertical',
        }}
      />
    </div>
  )
}

function TableSection({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px',
      marginBottom: '16px', overflow: 'hidden'
    }}>
      <div style={{
        padding: '14px 20px', borderBottom: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.1em' }}>{title.toUpperCase()}</span>
        <span style={{
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: '3px', padding: '1px 8px', fontSize: '10px', color: 'var(--text-muted)'
        }}>{count}</span>
      </div>
      {children}
    </div>
  )
}

function SupportingTable({ rows }: { rows: KeywordResult[] }) {
  return (
    <div style={{ overflowX: 'visible' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <thead>
          <tr style={{ background: 'var(--surface-2)' }}>
            {['Keyword', 'Vol', 'KD', 'Tag', 'Trend', 'Intent', 'Placement', 'Flag'].map(h => (
              <th key={h} style={{
                padding: '8px 12px', textAlign: 'left', fontSize: '10px',
                color: 'var(--text-muted)', letterSpacing: '0.05em', fontWeight: '500',
                borderBottom: '1px solid var(--border)', whiteSpace: 'normal'
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((kw, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text)', overflowWrap: 'anywhere' }}>{kw.keyword}</td>
              <td style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text-muted)' }}>{kw.volume?.toLocaleString()}</td>
              <td style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text-muted)' }}>{kw.kd}</td>
              <td style={{ padding: '10px 12px' }}><KdTag tag={kw.kd_tag} /></td>
              <td style={{ padding: '10px 12px' }}><TrendBadge direction={kw.trend_direction} /></td>
              <td style={{ padding: '10px 12px', fontSize: '11px', color: 'var(--text-muted)' }}>{kw.intent}</td>
              <td style={{ padding: '10px 12px', fontSize: '11px', color: 'var(--text-dim)', overflowWrap: 'anywhere' }}>{kw.content_placement}</td>
              <td style={{ padding: '10px 12px', fontSize: '10px', color: 'var(--warn)', overflowWrap: 'anywhere' }}>{kw.flag}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function LongtailTable({ rows }: { rows: KeywordResult[] }) {
  return (
    <div style={{ overflowX: 'visible' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <thead>
          <tr style={{ background: 'var(--surface-2)' }}>
            {['Keyword', 'Vol', 'KD', 'Tag', 'Trend', 'SERP', 'Content Format', 'Use Case'].map(h => (
              <th key={h} style={{
                padding: '8px 12px', textAlign: 'left', fontSize: '10px',
                color: 'var(--text-muted)', letterSpacing: '0.05em', fontWeight: '500',
                borderBottom: '1px solid var(--border)', whiteSpace: 'normal'
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((kw, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text)', overflowWrap: 'anywhere' }}>{kw.keyword}</td>
              <td style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text-muted)' }}>{kw.volume?.toLocaleString()}</td>
              <td style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text-muted)' }}>{kw.kd}</td>
              <td style={{ padding: '10px 12px' }}><KdTag tag={kw.kd_tag} /></td>
              <td style={{ padding: '10px 12px' }}><TrendBadge direction={kw.trend_direction} /></td>
              <td style={{ padding: '10px 12px', fontSize: '11px', color: 'var(--text-muted)' }}>{kw.serp_features}</td>
              <td style={{ padding: '10px 12px', fontSize: '11px', color: 'var(--text-dim)', overflowWrap: 'anywhere' }}>{kw.content_format}</td>
              <td style={{ padding: '10px 12px', fontSize: '11px', color: 'var(--text-dim)', overflowWrap: 'anywhere' }}>{kw.use_case}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CompetitorTable({ rows }: { rows: KeywordResult[] }) {
  return (
    <div style={{ overflowX: 'visible' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <thead>
          <tr style={{ background: 'var(--surface-2)' }}>
            {['Keyword', 'Vol', 'KD', 'Competitor Brand', 'Opportunity'].map(h => (
              <th key={h} style={{
                padding: '8px 12px', textAlign: 'left', fontSize: '10px',
                color: 'var(--text-muted)', letterSpacing: '0.05em', fontWeight: '500',
                borderBottom: '1px solid var(--border)', whiteSpace: 'normal'
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((kw, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text)', overflowWrap: 'anywhere' }}>{kw.keyword}</td>
              <td style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text-muted)' }}>{kw.volume?.toLocaleString()}</td>
              <td style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text-muted)' }}>{kw.kd}</td>
              <td style={{ padding: '10px 12px', fontSize: '11px', color: 'var(--text-muted)' }}>{kw.competitor_brand ?? '—'}</td>
              <td style={{ padding: '10px 12px', fontSize: '11px', color: 'var(--text-dim)', overflowWrap: 'anywhere' }}>{kw.opportunity}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

function NewPageOpportunities({ rows }: { rows: NewPageOpportunity[] }) {
  return (
    <div style={{ padding: '14px 20px', display: 'grid', gap: '12px' }}>
      {rows.map((item, i) => (
        <div key={i} style={{
          border: '1px solid var(--border)', borderRadius: '4px',
          padding: '14px', background: 'var(--surface-2)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', marginBottom: '8px' }}>
            <div>
              <div style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 600 }}>{item.page_title}</div>
              <div style={{ marginTop: '4px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: '10px', color: 'var(--accent)', letterSpacing: '0.05em' }}>{item.page_type}</span>
                {item.priority && <span style={{ fontSize: '10px', color: 'var(--warn)' }}>{item.priority} priority</span>}
                {item.intent && <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{item.intent}</span>}
              </div>
            </div>
            <div style={{ textAlign: 'right', minWidth: '120px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Primary</div>
              <div style={{ fontSize: '12px', color: 'var(--text)' }}>{item.primary_keyword}</div>
              {(item.primary_keyword_volume !== undefined || item.primary_keyword_kd !== undefined) && (
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {item.primary_keyword_volume !== undefined ? `vol ${item.primary_keyword_volume.toLocaleString()}` : ''}
                  {item.primary_keyword_volume !== undefined && item.primary_keyword_kd !== undefined ? ' / ' : ''}
                  {item.primary_keyword_kd !== undefined ? `kd ${item.primary_keyword_kd}` : ''}
                </div>
              )}
            </div>
          </div>
          {item.supporting_keywords && item.supporting_keywords.length > 0 && (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
              Supporting: {item.supporting_keywords.join(', ')}
            </div>
          )}
          {item.content_format && (
            <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '6px' }}>
              <strong style={{ color: 'var(--text-muted)' }}>Format:</strong> {item.content_format}
            </div>
          )}
          {item.why_new_page && (
            <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '6px', lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--text-muted)' }}>Why new page:</strong> {item.why_new_page}
            </div>
          )}
          {item.product_or_function_idea && (
            <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '6px', lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--text-muted)' }}>Product/function idea:</strong> {item.product_or_function_idea}
            </div>
          )}
          {item.difficulty_note && (
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              {item.difficulty_note}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function ArticleIdeaExpansions({ rows }: { rows: ArticleIdeaExpansion[] }) {
  return (
    <div style={{ padding: '14px 20px', display: 'grid', gap: '12px' }}>
      {rows.map((item, i) => (
        <div key={i} style={{
          border: '1px solid var(--border)', borderRadius: '4px',
          padding: '14px', background: 'var(--surface-2)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', marginBottom: '8px' }}>
            <div>
              <div style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 600 }}>{item.article_title}</div>
              <div style={{ marginTop: '4px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: '10px', color: 'var(--accent)', letterSpacing: '0.05em' }}>{item.recommended_content_type}</span>
                {item.priority && <span style={{ fontSize: '10px', color: 'var(--warn)' }}>{item.priority} priority</span>}
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{item.target_audience}</span>
              </div>
            </div>
            <div style={{ textAlign: 'right', minWidth: '140px', fontSize: '11px', color: 'var(--text-muted)' }}>
              Source<br />
              <span style={{ color: 'var(--text)' }}>{item.source_keyword_or_topic}</span>
            </div>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '6px', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--text-muted)' }}>Angle:</strong> {item.content_angle}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '6px', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--text-muted)' }}>Why they need it:</strong> {item.why_this_audience_needs_it}
          </div>
          {item.pain_points && item.pain_points.length > 0 && (
            <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '6px', lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--text-muted)' }}>Pain points:</strong> {item.pain_points.join('; ')}
            </div>
          )}
          <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '6px', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--text-muted)' }}>Trigger moment:</strong> {item.trigger_moment}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '6px', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--text-muted)' }}>Current workaround:</strong> {item.current_workaround}
          </div>
          {item.suggested_outline && item.suggested_outline.length > 0 && (
            <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '6px', lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--text-muted)' }}>Outline:</strong> {item.suggested_outline.join(' / ')}
            </div>
          )}
          <div style={{ fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--text-muted)' }}>Product connection:</strong> {item.product_connection}
          </div>
        </div>
      ))}
    </div>
  )
}

function DataAuditNotice({ audit }: { audit?: DataAudit }) {
  const unsupported = audit?.unsupported_ai_suggestions ?? []
  const corrections = audit?.metric_corrections_applied ?? []
  if (!unsupported.length && !corrections.length) return null

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--warn)', borderRadius: '6px',
      padding: '14px 20px', marginBottom: '16px'
    }}>
      <div style={{ fontSize: '10px', color: 'var(--warn)', letterSpacing: '0.1em', marginBottom: '8px' }}>
        DATA AUDIT
      </div>
      {unsupported.length > 0 && (
        <p style={{ margin: '0 0 8px', fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.6 }}>
          Removed {unsupported.length} AI suggestion{unsupported.length === 1 ? '' : 's'} because no matching uploaded/pasted keyword row was found.
        </p>
      )}
      {corrections.length > 0 && (
        <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.6 }}>
          Corrected {corrections.length} item{corrections.length === 1 ? '' : 's'} by exact keyword match when the AI missed or returned an invalid keyword ID.
        </p>
      )}
    </div>
  )
}

export default function ToolPage() {
  const router = useRouter()
  const fileRefs = useRef<(HTMLInputElement | null)[]>([])

  const [pageType, setPageType] = useState('')
  const [primaryKeyword, setPrimaryKeyword] = useState('')
  const [targetAudience, setTargetAudience] = useState('All / Undefined')
  const [customTargetAudience, setCustomTargetAudience] = useState('')
  const [sections, setSections] = useState<Section[]>([
    { id: 0, label: 'Broad Match Keywords', file: null, paste: '', role: 'broad_match' },
    { id: 1, label: 'Current Page / Competitor Gap', file: null, paste: '', role: 'current_page_gap' },
    { id: 2, label: 'Page Cluster / Page Opportunities', file: null, paste: '', role: 'page_cluster' },
  ])

  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [result, setResult] = useState<StrategyResult | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState('')
  const [showExcluded, setShowExcluded] = useState(false)
  const [showCompetitor, setShowCompetitor] = useState(false)
  const [showMissing, setShowMissing] = useState(false)
  const [showNewPages, setShowNewPages] = useState(false)
  const [showArticleIdeas, setShowArticleIdeas] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    async function checkAdmin() {
      try {
        const res = await fetch('/api/admin-status')
        const data = await res.json()
        setIsAdmin(data.isAdmin === true)
      } catch {
        setIsAdmin(false)
      }
    }

    checkAdmin()
  }, [])

  function addSection() {
    if (sections.length >= MAX_SECTIONS) return
    setSections(prev => [...prev, { id: Date.now(), label: `Section ${prev.length + 1}`, file: null, paste: '', role: 'auto' }])
  }

  function removeSection(id: number) {
    setSections(prev => prev.filter(s => s.id !== id))
  }

  function updateLabel(id: number, label: string) {
    setSections(prev => prev.map(s => s.id === id ? { ...s, label } : s))
  }

  function updateRole(id: number, role: SourceRole) {
    setSections(prev => prev.map(s => s.id === id ? { ...s, role } : s))
  }

  function updateFile(id: number, file: File | null) {
    setSections(prev => prev.map(s => s.id === id ? { ...s, file } : s))
  }

  function updatePaste(id: number, paste: string) {
    setSections(prev => prev.map(s => s.id === id ? { ...s, paste } : s))
  }

  async function handleGenerate() {
    const filledSections = sections.filter(s => s.file || s.paste.trim())
    if (filledSections.length === 0 || !pageType || !primaryKeyword) return

    setLoading(true)
    setError('')
    setResult(null)

    const msgs = ['Parsing files...', 'Pre-filtering keywords...', 'Sending to AI...', 'Building keyword strategy...']
    let i = 0
    setLoadingMsg(msgs[0])
    const interval = setInterval(() => { i = (i + 1) % msgs.length; setLoadingMsg(msgs[i]) }, 2000)

    const formData = new FormData()
    formData.append('pageType', pageType)
    formData.append('primaryKeyword', primaryKeyword.trim())
    formData.append(
      'targetAudience',
      targetAudience === 'Custom audience' ? customTargetAudience.trim() : targetAudience
    )
    for (const section of sections) {
      if (!section.file && !section.paste.trim()) continue
      const key = section.label.toLowerCase().replace(/\s+/g, '_')
      formData.append(`${key}_label`, section.label)
      formData.append(`${key}_role`, section.role)
      if (section.file) formData.append(`${key}_file`, section.file)
      if (section.paste.trim()) formData.append(`${key}_paste`, section.paste.trim())
    }

    const res = await fetch('/api/generate', { method: 'POST', body: formData })
    clearInterval(interval)
    setLoading(false)

    if (!res.ok) {
      const { error: err } = await res.json()
      setError(err || 'Something went wrong')
      return
    }

    const data = await res.json()
    setResult(data.result)
    setStats(data.stats)
  }

  function handleCopyJSON() {
    if (!result) return
    navigator.clipboard.writeText(JSON.stringify(result, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleDownloadReport() {
    if (!result) return
    downloadMarkdownReport(result, stats)
  }

  function resetForm() {
    setResult(null); setStats(null); setError('')
    setSections(prev => prev.map(s => ({ ...s, file: null, paste: '' })))
    fileRefs.current.forEach(ref => { if (ref) ref.value = '' })
  }

  const canGenerate = sections.some(s => s.file || s.paste.trim()) && !!pageType && !!primaryKeyword && !loading

  const strategyNotes = result && typeof result.page_strategy_notes === 'object'
    ? result.page_strategy_notes as PageStrategyNotes : null
  const strategyString = result && typeof result.page_strategy_notes === 'string'
    ? result.page_strategy_notes : null

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>

      {/* Header */}
      <header style={{
        borderBottom: '1px solid var(--border)', padding: '0 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: '52px', position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ color: 'var(--accent)', fontSize: '11px', letterSpacing: '0.1em' }}>▸</span>
          <span style={{ fontWeight: '600', fontSize: '14px' }}>Keyword Strategy Agent</span>
          <span style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '3px', padding: '2px 8px', fontSize: '10px', color: 'var(--text-muted)'
          }}>v2</span>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {isAdmin && (
            <button onClick={() => router.push('/guide')} style={{
              background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)',
              padding: '5px 12px', fontSize: '11px'
            }}>Guide</button>
          )}
          {isAdmin ? (
            <button onClick={() => router.push('/admin')} style={{
              background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)',
              padding: '5px 12px', fontSize: '11px'
            }}>Prompt Editor</button>
          ) : (
            <button onClick={() => router.push('/admin?mode=unlock&returnTo=/tool')} style={{
              background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)',
              padding: '5px 12px', fontSize: '11px'
            }}>Admin Login</button>
          )}
          <button onClick={async () => { await fetch('/api/logout', { method: 'POST' }); router.push('/') }} style={{
            background: 'none', border: 'none', color: 'var(--text-muted)', padding: '5px'
          }}>Logout</button>
        </div>
      </header>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '36px 24px' }}>

        {result ? (
          <div className="fade-up">

            {/* Stats */}
            {stats && (
              <div style={{
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px',
                padding: '16px 24px', marginBottom: '16px',
                display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px'
              }}>
                <StatBadge label="Input keywords" value={stats.total} />
                <StatBadge label="After vol filter" value={stats.afterVolumeFilter} />
                <StatBadge label="After dedup" value={stats.afterDedup} />
                <StatBadge label="Sent to AI" value={stats.sentToAI} accent />
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
              <button onClick={resetForm} style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                color: 'var(--text-muted)', padding: '6px 14px', fontSize: '11px'
              }}>← New Analysis</button>
              <button onClick={handleDownloadReport} style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                color: 'var(--text-muted)', padding: '6px 14px', fontSize: '11px', marginRight: '8px'
              }}>Download Report</button>
              <button onClick={handleCopyJSON} style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                color: copied ? 'var(--accent)' : 'var(--text-muted)', padding: '6px 14px', fontSize: '11px'
              }}>{copied ? '✓ Copied' : 'Copy JSON'}</button>
            </div>

            <DataAuditNotice audit={result.data_audit} />

            {/* Primary Keyword */}
            <div style={{
              background: 'var(--surface)',
              border: `1px solid ${result.primary_keyword.validated ? 'var(--accent)' : 'var(--warn)'}`,
              borderRadius: '6px', padding: '20px', marginBottom: '16px'
            }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: '12px' }}>
                PRIMARY KEYWORD {result.primary_keyword.validated ? '· ✓ VALIDATED' : '· ⚠ SWAP SUGGESTED'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '18px', fontWeight: '600', color: result.primary_keyword.validated ? 'var(--accent)' : 'var(--warn)' }}>
                  {result.primary_keyword.keyword}
                </span>
                <KdTag tag={result.primary_keyword.kd_tag} />
                <TrendBadge direction={result.primary_keyword.trend_direction} />
                <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>vol {result.primary_keyword.volume?.toLocaleString()}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>kd {result.primary_keyword.kd}</span>
                {result.primary_keyword.intent && (
                  <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{result.primary_keyword.intent}</span>
                )}
              </div>
              {result.primary_keyword.combined_signal && (
                <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
                  Signal: {result.primary_keyword.combined_signal}
                </div>
              )}
              {result.primary_keyword.note && (
                <p style={{ margin: '10px 0 0', fontSize: '11px', color: 'var(--text-dim)', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
                  {result.primary_keyword.note}
                </p>
              )}
            </div>

            {/* Supporting Keywords */}
            {result.supporting_keywords?.length > 0 && (
              <TableSection title="Supporting Keywords" count={result.supporting_keywords.length}>
                <SupportingTable rows={result.supporting_keywords} />
              </TableSection>
            )}

            {/* Longtail Keywords */}
            {result.longtail_keywords?.length > 0 && (
              <TableSection title="Longtail Keywords" count={result.longtail_keywords.length}>
                <LongtailTable rows={result.longtail_keywords} />
              </TableSection>
            )}

            {/* Page Strategy Notes */}
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px',
              padding: '20px', marginBottom: '16px'
            }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: '12px' }}>
                PAGE STRATEGY NOTES
              </div>
              {strategyNotes ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {([
                    { label: 'Content Format', value: strategyNotes.content_format },
                    { label: 'Biggest Opportunity', value: strategyNotes.biggest_opportunity },
                    { label: 'Primary Risk', value: strategyNotes.primary_risk },
                  ] as { label: string; value: string }[]).map(({ label, value }) => (
                    <div key={label}>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px', letterSpacing: '0.05em' }}>{label.toUpperCase()}</div>
                      <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-dim)', lineHeight: '1.7' }}>{value}</p>
                    </div>
                  ))}
                  {strategyNotes.low_demand_modifier_guidance?.length ? (
                    <div style={{ fontSize: '11px', color: 'var(--warn)', lineHeight: 1.6 }}>
                      <strong>Low-demand wording:</strong> {strategyNotes.low_demand_modifier_guidance.join(' ')}
                    </div>
                  ) : null}
                </div>
              ) : (
                <p style={{ margin: 0, color: 'var(--text-dim)', lineHeight: '1.7', fontSize: '12px' }}>{strategyString}</p>
              )}
            </div>

            {/* New Page Opportunities (collapsible) */}
            {result.new_page_opportunities && result.new_page_opportunities.length > 0 && (
              <div style={{
                background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: '6px',
                overflow: 'hidden', marginBottom: '16px'
              }}>
                <button onClick={() => setShowNewPages(!showNewPages)} style={{
                  width: '100%', background: 'none', border: 'none', padding: '14px 20px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  color: 'var(--accent)', textAlign: 'left', cursor: 'pointer'
                }}>
                  <span style={{ fontSize: '10px', letterSpacing: '0.1em' }}>NEW PAGE OPPORTUNITIES ({result.new_page_opportunities.length})</span>
                  <span style={{ fontSize: '11px' }}>{showNewPages ? '▲' : '▼'}</span>
                </button>
                {showNewPages && (
                  <div style={{ borderTop: '1px solid var(--border)' }}>
                    <NewPageOpportunities rows={result.new_page_opportunities} />
                  </div>
                )}
              </div>
            )}

            {/* Article Idea Expansions (collapsible) */}
            {result.article_idea_expansions && result.article_idea_expansions.length > 0 && (
              <div style={{
                background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: '6px',
                overflow: 'hidden', marginBottom: '16px'
              }}>
                <button onClick={() => setShowArticleIdeas(!showArticleIdeas)} style={{
                  width: '100%', background: 'none', border: 'none', padding: '14px 20px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  color: 'var(--accent)', textAlign: 'left', cursor: 'pointer'
                }}>
                  <span style={{ fontSize: '10px', letterSpacing: '0.1em' }}>ARTICLE IDEA EXPANSIONS ({result.article_idea_expansions.length})</span>
                  <span style={{ fontSize: '11px' }}>{showArticleIdeas ? '▲' : '▼'}</span>
                </button>
                {showArticleIdeas && (
                  <div style={{ borderTop: '1px solid var(--border)' }}>
                    <ArticleIdeaExpansions rows={result.article_idea_expansions} />
                  </div>
                )}
              </div>
            )}

            {/* Competitor Insights (collapsible) */}
            {result.competitor_insights?.length > 0 && (
              <div style={{
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px',
                overflow: 'hidden', marginBottom: '16px'
              }}>
                <button onClick={() => setShowCompetitor(!showCompetitor)} style={{
                  width: '100%', background: 'none', border: 'none', padding: '14px 20px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  color: 'var(--text-muted)', textAlign: 'left', cursor: 'pointer'
                }}>
                  <span style={{ fontSize: '10px', letterSpacing: '0.1em' }}>COMPETITOR INSIGHTS ({result.competitor_insights.length})</span>
                  <span style={{ fontSize: '11px' }}>{showCompetitor ? '▲' : '▼'}</span>
                </button>
                {showCompetitor && (
                  <div style={{ borderTop: '1px solid var(--border)' }}>
                    <CompetitorTable rows={result.competitor_insights} />
                  </div>
                )}
              </div>
            )}

            {/* Excluded Keywords (collapsible) */}
            {result.excluded_keywords?.length > 0 && (
              <div style={{
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px',
                overflow: 'hidden', marginBottom: '16px'
              }}>
                <button onClick={() => setShowExcluded(!showExcluded)} style={{
                  width: '100%', background: 'none', border: 'none', padding: '14px 20px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  color: 'var(--text-muted)', textAlign: 'left', cursor: 'pointer'
                }}>
                  <span style={{ fontSize: '10px', letterSpacing: '0.1em' }}>EXCLUDED KEYWORDS ({result.excluded_keywords.length})</span>
                  <span style={{ fontSize: '11px' }}>{showExcluded ? '▲' : '▼'}</span>
                </button>
                {showExcluded && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: '12px 20px' }}>
                    {result.excluded_keywords.map((kw, i) => (
                      <div key={i} style={{
                        display: 'flex', gap: '16px', padding: '6px 0',
                        borderBottom: i < result.excluded_keywords.length - 1 ? '1px solid var(--border)' : 'none'
                      }}>
                        <span style={{ color: 'var(--text-muted)', minWidth: '180px', fontSize: '12px' }}>{kw.keyword}</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '11px', opacity: 0.7 }}>{kw.reason}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Missing Exports (collapsible) */}
            {result.missing_exports && result.missing_exports.length > 0 && (
              <div style={{
                background: 'var(--surface)', border: '1px solid var(--warn)', borderRadius: '6px',
                overflow: 'hidden', marginBottom: '16px'
              }}>
                <button onClick={() => setShowMissing(!showMissing)} style={{
                  width: '100%', background: 'none', border: 'none', padding: '14px 20px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  color: 'var(--warn)', textAlign: 'left', cursor: 'pointer'
                }}>
                  <span style={{ fontSize: '10px', letterSpacing: '0.1em' }}>⚠ MISSING EXPORTS ({result.missing_exports.length})</span>
                  <span style={{ fontSize: '11px' }}>{showMissing ? '▲' : '▼'}</span>
                </button>
                {showMissing && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: '12px 20px' }}>
                    {result.missing_exports.map((item, i) => (
                      <div key={i} style={{
                        display: 'flex', gap: '16px', padding: '6px 0',
                        borderBottom: i < result.missing_exports!.length - 1 ? '1px solid var(--border)' : 'none'
                      }}>
                        <span style={{ color: 'var(--warn)', minWidth: '180px', fontSize: '12px', fontWeight: '500' }}>{item.topic}</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{item.reason}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        ) : (
          /* ── Form ── */
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '28px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', letterSpacing: '0.05em' }}>PAGE TYPE</label>
                <select value={pageType} onChange={e => setPageType(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', color: pageType ? 'var(--text)' : 'var(--text-muted)' }}>
                  <option value="">Select page type...</option>
                  {PAGE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', letterSpacing: '0.05em' }}>PRIMARY KEYWORD</label>
                <input type="text" placeholder="e.g. video enhancer online" value={primaryKeyword}
                  onChange={e => setPrimaryKeyword(e.target.value)} style={{ width: '100%', padding: '9px 12px' }} />
              </div>
            </div>

            <div style={{ marginBottom: '28px' }}>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', letterSpacing: '0.05em' }}>TARGET AUDIENCE</label>
              <select value={targetAudience} onChange={e => setTargetAudience(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', color: 'var(--text)' }}>
                {AUDIENCE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              {targetAudience === 'Custom audience' && (
                <input
                  type="text"
                  placeholder="Describe the target audience..."
                  value={customTargetAudience}
                  onChange={e => setCustomTargetAudience(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', marginTop: '10px' }}
                />
              )}
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px', lineHeight: 1.6 }}>
                Used only for Article Idea Expansions. If All / Undefined is selected, article ideas will be skipped and other analysis sections are unaffected.
              </p>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <div style={{ fontSize: '10px', letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Keyword Sources <span style={{ fontWeight: 400, marginLeft: '8px' }}>({sections.length}/{MAX_SECTIONS} sections)</span>
                </div>
                {sections.length < MAX_SECTIONS && (
                  <button type="button" onClick={addSection} style={{
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    color: 'var(--accent)', fontSize: '11px', padding: '4px 12px',
                  }}>+ Add Section</button>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {sections.map((section, i) => (
                  <SectionRow
                    key={section.id} section={section} index={i}
                    canRemove={sections.length > 1}
                    inputRef={el => { fileRefs.current[i] = el }}
                    onLabelChange={label => updateLabel(section.id, label)}
                    onRoleChange={role => updateRole(section.id, role)}
                    onFileChange={file => updateFile(section.id, file)}
                    onPasteChange={paste => updatePaste(section.id, paste)}
                    onRemove={() => removeSection(section.id)}
                  />
                ))}
              </div>

              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '10px' }}>
                Upload CSV/XLSX with Keyword + Volume columns, or paste rows as keyword [tab] volume [tab] KD.
                Choose a source role so the AI uses broad match, current-page gap, and page-cluster data for the right decisions.
                Pre-filter: parses all workbook sheets, removes vol &lt; 30, deduplicates, preserves longtail signals, caps at 500 sent to AI.
              </p>
            </div>

            {error && (
              <div style={{
                background: 'var(--surface)', border: '1px solid var(--danger)',
                borderRadius: '4px', padding: '10px 14px', marginBottom: '16px',
                color: 'var(--danger)', fontSize: '12px'
              }}>{error}</div>
            )}

            <button onClick={handleGenerate} disabled={!canGenerate} style={{
              width: '100%', padding: '12px',
              background: canGenerate ? 'var(--accent)' : 'var(--surface-2)',
              border: canGenerate ? 'none' : '1px solid var(--border)',
              color: canGenerate ? '#000' : 'var(--text-muted)',
              fontWeight: '600', fontSize: '13px',
              cursor: canGenerate ? 'pointer' : 'not-allowed', letterSpacing: '0.02em'
            }}>
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <span className="pulse">●</span> {loadingMsg}
                </span>
              ) : 'Run Keyword Strategy →'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
