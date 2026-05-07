'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

// ─── Types ─────────────────────────────────────────────────────────────────
type Section = {
  id: number
  label: string
  file: File | null
}

interface KeywordResult extends Record<string, unknown> {
  keyword: string; volume: number; kd: number; kd_tag: string
  content_placement?: string; use_case?: string; note?: string; reason?: string; validated?: boolean
}

interface StrategyResult {
  primary_keyword: KeywordResult & { validated: boolean; note: string }
  supporting_keywords: KeywordResult[]
  longtail_keywords: KeywordResult[]
  excluded_keywords: KeywordResult[]
  page_strategy_notes: string
}

interface Stats {
  total: number
  afterVolumeFilter: number
  afterDedup: number
  sentToAI: number
  bySource: Record<string, number>
}

const MAX_SECTIONS = 5

const PAGE_TYPES = [
  'Feature Page',
  'Online Tool Page',
  'Blog Post',
  'GEO Page',
  'Docs Page',
]

// ─── Sub-components ─────────────────────────────────────────────────────────

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

function Label({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      fontSize: '10px', letterSpacing: '0.1em', color: 'var(--text-muted)',
      marginBottom: '8px', textTransform: 'uppercase', ...style
    }}>
      {children}
    </div>
  )
}

function SectionRow({
  section, index, canRemove, inputRef, onLabelChange, onFileChange, onRemove
}: {
  section: Section
  index: number
  canRemove: boolean
  inputRef: (el: HTMLInputElement | null) => void
  onLabelChange: (v: string) => void
  onFileChange: (f: File | null) => void
  onRemove: () => void
}) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '200px 1fr auto',
      gap: '10px',
      alignItems: 'center',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: '4px',
      padding: '12px 14px',
    }}>
      <input
        type="text"
        value={section.label}
        onChange={e => onLabelChange(e.target.value)}
        placeholder={`Section ${index + 1} name`}
        style={{ padding: '7px 10px', fontSize: '12px' }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: '4px', padding: '6px 12px', cursor: 'pointer',
          fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap',
        }}>
          <span>↑</span>
          {section.file ? 'Change file' : 'Upload CSV / XLSX'}
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            style={{ display: 'none' }}
            onChange={e => onFileChange(e.target.files?.[0] ?? null)}
          />
        </label>
        {section.file && (
          <span style={{ fontSize: '11px', color: 'var(--accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            ✓ {section.file.name}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        disabled={!canRemove}
        title="Remove section"
        style={{
          background: 'none', border: 'none',
          color: canRemove ? 'var(--text-muted)' : 'transparent',
          fontSize: '16px', cursor: canRemove ? 'pointer' : 'default',
          padding: '2px 4px', lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  )
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px',
      marginBottom: '16px', overflow: 'hidden'
    }}>
      <div style={{
        padding: '14px 20px', borderBottom: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.1em' }}>
          {title.toUpperCase()}
        </span>
        <span style={{
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: '3px', padding: '1px 8px', fontSize: '10px', color: 'var(--text-muted)'
        }}>{count}</span>
      </div>
      {children}
    </div>
  )
}

function Table({ rows, extraCol }: {
  rows: KeywordResult[]
  extraCol: { header: string; key: string }
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--surface-2)' }}>
            {['Keyword', 'Volume', 'KD', 'Tag', extraCol.header].map(h => (
              <th key={h} style={{
                padding: '8px 16px', textAlign: 'left', fontSize: '10px',
                color: 'var(--text-muted)', letterSpacing: '0.05em', fontWeight: '500',
                borderBottom: '1px solid var(--border)'
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((kw, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '10px 16px', fontSize: '12px', color: 'var(--text)' }}>{kw.keyword}</td>
              <td style={{ padding: '10px 16px', fontSize: '12px', color: 'var(--text-muted)' }}>{kw.volume?.toLocaleString()}</td>
              <td style={{ padding: '10px 16px', fontSize: '12px', color: 'var(--text-muted)' }}>{kw.kd}</td>
              <td style={{ padding: '10px 16px' }}><KdTag tag={kw.kd_tag} /></td>
              <td style={{ padding: '10px 16px', fontSize: '11px', color: 'var(--text-dim)', maxWidth: '260px' }}>
                {String(kw[extraCol.key] ?? '')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────
export default function ToolPage() {
  const router = useRouter()
  const fileRefs = useRef<(HTMLInputElement | null)[]>([])

  const [pageType, setPageType] = useState('')
  const [primaryKeyword, setPrimaryKeyword] = useState('')
  const [sections, setSections] = useState<Section[]>([
    { id: 0, label: 'Topic Keywords',      file: null },
    { id: 1, label: 'Related Keywords',    file: null },
    { id: 2, label: 'Competitor Keywords', file: null },
  ])

  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [result, setResult] = useState<StrategyResult | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState('')
  const [showExcluded, setShowExcluded] = useState(false)
  const [copied, setCopied] = useState(false)

  // ── Section management ──────────────────────────────────────────────────
  function addSection() {
    if (sections.length >= MAX_SECTIONS) return
    const newId = Date.now()
    setSections(prev => [...prev, { id: newId, label: `Section ${prev.length + 1}`, file: null }])
  }

  function removeSection(id: number) {
    setSections(prev => prev.filter(s => s.id !== id))
  }

  function updateLabel(id: number, label: string) {
    setSections(prev => prev.map(s => s.id === id ? { ...s, label } : s))
  }

  function updateFile(id: number, file: File | null) {
    setSections(prev => prev.map(s => s.id === id ? { ...s, file } : s))
  }

  // ── Submit ──────────────────────────────────────────────────────────────
  async function handleGenerate() {
    const filledSections = sections.filter(s => s.file)
    if (filledSections.length === 0 || !pageType || !primaryKeyword) return

    setLoading(true)
    setError('')
    setResult(null)

    const msgs = [
      'Parsing files...',
      'Pre-filtering keywords...',
      'Sending to AI...',
      'Building keyword strategy...',
    ]
    let i = 0
    setLoadingMsg(msgs[0])
    const interval = setInterval(() => {
      i = (i + 1) % msgs.length
      setLoadingMsg(msgs[i])
    }, 2000)

    const formData = new FormData()
    formData.append('pageType', pageType)
    formData.append('primaryKeyword', primaryKeyword.trim())

    for (const section of sections) {
      if (!section.file) continue
      const key = section.label.toLowerCase().replace(/\s+/g, '_')
      formData.append(`${key}_file`, section.file)
      formData.append(`${key}_label`, section.label)
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

  function resetForm() {
    setResult(null)
    setStats(null)
    setError('')
    setSections(prev => prev.map(s => ({ ...s, file: null })))
    fileRefs.current.forEach(ref => { if (ref) ref.value = '' })
  }

  const canGenerate = sections.some(s => s.file) && !!pageType && !!primaryKeyword && !loading

  // ── Render ──────────────────────────────────────────────────────────────
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
          }}>v1</span>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button onClick={() => router.push('/admin')} style={{
            background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)',
            padding: '5px 12px', fontSize: '11px'
          }}>Admin</button>
          <button onClick={async () => { await fetch('/api/logout', { method: 'POST' }); router.push('/') }} style={{
            background: 'none', border: 'none', color: 'var(--text-muted)', padding: '5px'
          }}>Logout</button>
        </div>
      </header>

      <div style={{ maxWidth: '780px', margin: '0 auto', padding: '36px 24px' }}>

        {result ? (
          /* ── Results ── */
          <div className="fade-up">
            {/* Stats bar */}
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
              <button onClick={handleCopyJSON} style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                color: copied ? 'var(--accent)' : 'var(--text-muted)', padding: '6px 14px', fontSize: '11px'
              }}>
                {copied ? '✓ Copied' : 'Copy JSON'}
              </button>
            </div>

            {/* Primary Keyword */}
            <div style={{
              background: 'var(--surface)', border: `1px solid ${result.primary_keyword.validated ? 'var(--accent)' : 'var(--warn)'}`,
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
                <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>vol {result.primary_keyword.volume?.toLocaleString()}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>kd {result.primary_keyword.kd}</span>
              </div>
              {result.primary_keyword.note && (
                <p style={{ margin: '10px 0 0', fontSize: '11px', color: 'var(--text-dim)', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
                  {result.primary_keyword.note}
                </p>
              )}
            </div>

            {/* Supporting Keywords */}
            <Section title="Supporting Keywords" count={result.supporting_keywords.length}>
              <Table rows={result.supporting_keywords} extraCol={{ header: 'Placement', key: 'content_placement' }} />
            </Section>

            {/* Longtail Keywords */}
            <Section title="Longtail Keywords" count={result.longtail_keywords.length}>
              <Table rows={result.longtail_keywords} extraCol={{ header: 'Use Case', key: 'use_case' }} />
            </Section>

            {/* Page Strategy Notes */}
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px',
              padding: '20px', marginBottom: '16px'
            }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: '12px' }}>
                PAGE STRATEGY NOTES
              </div>
              <p style={{ margin: 0, color: 'var(--text-dim)', lineHeight: '1.7', fontSize: '12px' }}>
                {result.page_strategy_notes}
              </p>
            </div>

            {/* Excluded Keywords */}
            {result.excluded_keywords?.length > 0 && (
              <div style={{
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden'
              }}>
                <button
                  onClick={() => setShowExcluded(!showExcluded)}
                  style={{
                    width: '100%', background: 'none', border: 'none', padding: '14px 20px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    color: 'var(--text-muted)', textAlign: 'left', cursor: 'pointer'
                  }}
                >
                  <span style={{ fontSize: '10px', letterSpacing: '0.1em' }}>
                    EXCLUDED KEYWORDS ({result.excluded_keywords.length})
                  </span>
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
          </div>
        ) : (
          /* ── Form ── */
          <div>
            {/* Row: Page type + Primary keyword */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '28px' }}>
              <div>
                <Label>Page Type</Label>
                <select
                  value={pageType}
                  onChange={e => setPageType(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', color: pageType ? 'var(--text)' : 'var(--text-muted)' }}
                >
                  <option value="">Select page type...</option>
                  {PAGE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <Label>Primary Keyword</Label>
                <input
                  type="text"
                  placeholder="e.g. video enhancer online"
                  value={primaryKeyword}
                  onChange={e => setPrimaryKeyword(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px' }}
                />
              </div>
            </div>

            {/* Keyword Sections */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: '14px'
              }}>
                <Label style={{ margin: 0 }}>
                  Keyword Files
                  <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: '8px' }}>
                    ({sections.length}/{MAX_SECTIONS} sections)
                  </span>
                </Label>
                {sections.length < MAX_SECTIONS && (
                  <button
                    type="button"
                    onClick={addSection}
                    style={{
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      color: 'var(--accent)', fontSize: '11px', padding: '4px 12px',
                    }}
                  >
                    + Add Section
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {sections.map((section, i) => (
                  <SectionRow
                    key={section.id}
                    section={section}
                    index={i}
                    canRemove={sections.length > 1}
                    inputRef={el => { fileRefs.current[i] = el }}
                    onLabelChange={label => updateLabel(section.id, label)}
                    onFileChange={file => updateFile(section.id, file)}
                    onRemove={() => removeSection(section.id)}
                  />
                ))}
              </div>

              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '10px' }}>
                CSV or XLSX from SEMrush, Ahrefs, or similar. Needs Keyword + Volume columns.
                Pre-filter: removes vol &lt; 30, deduplicates, caps at 300 sent to AI.
              </p>
            </div>

            {error && (
              <div style={{
                background: 'var(--surface)', border: '1px solid var(--danger)',
                borderRadius: '4px', padding: '10px 14px', marginBottom: '16px',
                color: 'var(--danger)', fontSize: '12px'
              }}>
                {error}
              </div>
            )}

            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              style={{
                width: '100%', padding: '12px',
                background: canGenerate ? 'var(--accent)' : 'var(--surface-2)',
                border: canGenerate ? 'none' : '1px solid var(--border)',
                color: canGenerate ? '#000' : 'var(--text-muted)',
                fontWeight: '600', fontSize: '13px',
                cursor: canGenerate ? 'pointer' : 'not-allowed',
                letterSpacing: '0.02em'
              }}
            >
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <span className="pulse">●</span> {loadingMsg}
                </span>
              ) : (
                'Run Keyword Strategy →'
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
