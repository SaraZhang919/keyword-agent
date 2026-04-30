'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

const PAGE_TYPES = ['Feature Page', 'Online Tool Page', 'Blog Post', 'GEO Page', 'Docs Page']

interface KeywordResult {
  keyword: string; volume: number; kd: number; kd_tag: string
  intent?: string; trend_direction?: string; cpc?: number; density?: number
  source?: string; content_placement?: string; flag?: string
  serp_features?: string; content_format?: string; use_case?: string
  competitor_brand?: string; opportunity?: string; reason?: string
  validated?: boolean; note?: string; combined_signal?: string
  [key: string]: unknown
}

interface PageStrategyNotes { content_format: string; biggest_opportunity: string; primary_risk: string }

interface StrategyResult {
  primary_keyword: KeywordResult
  supporting_keywords: KeywordResult[]
  longtail_keywords: KeywordResult[]
  competitor_insights: KeywordResult[]
  excluded_keywords: KeywordResult[]
  missing_exports: { topic: string; reason: string }[]
  page_strategy_notes: PageStrategyNotes | string
}

interface Stats {
  topic: number; related: number; competitor: number
  total: number; afterVolumeFilter: number; afterDedup: number
  brandTerms: number; sentToAI: number
}

function KdTag({ tag }: { tag: string }) {
  const color = tag === 'Priority' ? 'var(--tag-priority)' : tag === 'Mid-term' ? 'var(--tag-midterm)' : 'var(--tag-longterm)'
  return (
    <span style={{ border: `1px solid ${color}`, color, borderRadius: '3px', padding: '1px 6px', fontSize: '10px', whiteSpace: 'nowrap' }}>
      {tag}
    </span>
  )
}

function TrendBadge({ trend }: { trend?: string }) {
  if (!trend || trend === 'Insufficient Data') return <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>—</span>
  const color = trend === 'Rising' ? 'var(--tag-priority)' : trend === 'Declining' ? 'var(--danger)' : 'var(--text-muted)'
  const arrow = trend === 'Rising' ? '↑' : trend === 'Declining' ? '↓' : '→'
  return <span style={{ color, fontSize: '10px' }}>{arrow} {trend}</span>
}

function SourceBadge({ source }: { source?: string }) {
  const color = source === 'topic' ? 'var(--accent)' : source === 'related' ? 'var(--warn)' : 'var(--text-muted)'
  return source ? (
    <span style={{ border: `1px solid ${color}`, color, borderRadius: '3px', padding: '1px 5px', fontSize: '9px', whiteSpace: 'nowrap' }}>
      {source}
    </span>
  ) : null
}

function StatBadge({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '18px', fontWeight: '600', color: 'var(--accent)' }}>{value.toLocaleString()}</div>
      {sub && <div style={{ fontSize: '9px', color: 'var(--accent)', opacity: 0.7 }}>{sub}</div>}
      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>{label}</div>
    </div>
  )
}

function Section({ title, count, color, children }: { title: string; count: number; color?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface)', border: `1px solid ${color ?? 'var(--border)'}`, borderRadius: '6px', marginBottom: '16px', overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '10px', color: color ?? 'var(--text-muted)', letterSpacing: '0.1em' }}>{title.toUpperCase()}</span>
        <span style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '3px', padding: '1px 8px', fontSize: '10px', color: 'var(--text-muted)' }}>{count}</span>
      </div>
      {children}
    </div>
  )
}

function FileUpload({ label, sublabel, file, onChange, required }: {
  label: string; sublabel: string; file: File | null
  onChange: (f: File | null) => void; required?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div style={{ marginBottom: '12px' }}>
      <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '5px', letterSpacing: '0.05em' }}>
        {label} {required && <span style={{ color: 'var(--accent)' }}>*</span>}
      </label>
      <div onClick={() => ref.current?.click()} style={{
        border: `1px dashed ${file ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: '4px', padding: '10px 14px', cursor: 'pointer',
        background: file ? 'var(--accent-dim)' : 'var(--surface-2)', transition: 'all 0.15s',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        {file ? (
          <div>
            <div style={{ color: 'var(--accent)', fontSize: '11px', fontWeight: '500' }}>✓ {file.name}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>{(file.size / 1024).toFixed(0)} KB</div>
          </div>
        ) : (
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{sublabel}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '10px', opacity: 0.6 }}>Click to upload CSV</div>
          </div>
        )}
        {file && (
          <button onClick={e => { e.stopPropagation(); onChange(null) }} style={{
            background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '14px', cursor: 'pointer', padding: '0 4px'
          }}>×</button>
        )}
      </div>
      <input ref={ref} type="file" accept=".csv,.xlsx" style={{ display: 'none' }} onChange={e => onChange(e.target.files?.[0] ?? null)} />
    </div>
  )
}

export default function ToolPage() {
  const router = useRouter()
  const [topicFile, setTopicFile] = useState<File | null>(null)
  const [relatedFile, setRelatedFile] = useState<File | null>(null)
  const [competitorFile, setCompetitorFile] = useState<File | null>(null)
  const [pageType, setPageType] = useState('')
  const [primaryKeyword, setPrimaryKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [result, setResult] = useState<StrategyResult | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState('')
  const [showExcluded, setShowExcluded] = useState(false)
  const [copied, setCopied] = useState(false)

  async function handleLogout() {
    await fetch('/api/logout', { method: 'POST' })
    router.push('/')
  }

  async function handleGenerate() {
    if (!topicFile || !pageType || !primaryKeyword) return
    setLoading(true); setError(''); setResult(null)

    const msgs = ['Parsing CSV files...', 'Merging & filtering keywords...', 'Sending to AI...', 'Building keyword strategy...']
    let i = 0; setLoadingMsg(msgs[0])
    const interval = setInterval(() => { i = (i + 1) % msgs.length; setLoadingMsg(msgs[i]) }, 2000)

    const form = new FormData()
    form.append('topicFile', topicFile)
    if (relatedFile) form.append('relatedFile', relatedFile)
    if (competitorFile) form.append('competitorFile', competitorFile)
    form.append('pageType', pageType)
    form.append('primaryKeyword', primaryKeyword)

    const res = await fetch('/api/generate', { method: 'POST', body: form })
    clearInterval(interval); setLoading(false)

    if (!res.ok) { const { error: err } = await res.json(); setError(err || 'Something went wrong'); return }
    const data = await res.json()
    setResult(data.result); setStats(data.stats)
  }

  function handleCopyJSON() {
    if (!result) return
    navigator.clipboard.writeText(JSON.stringify(result, null, 2))
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  const canGenerate = !!topicFile && !!pageType && !!primaryKeyword && !loading

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header style={{ borderBottom: '1px solid var(--border)', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '52px', position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ color: 'var(--accent)', fontSize: '11px' }}>▸</span>
          <span style={{ fontWeight: '600', fontSize: '14px' }}>Keyword Strategy Agent</span>
          <span style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px', padding: '2px 8px', fontSize: '10px', color: 'var(--text-muted)' }}>v1</span>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button onClick={() => router.push('/admin')} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)', padding: '5px 12px', fontSize: '11px', borderRadius: '4px' }}>Admin</button>
          <button onClick={handleLogout} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', padding: '5px', cursor: 'pointer' }}>Logout</button>
        </div>
      </header>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px', display: 'grid', gridTemplateColumns: '320px 1fr', gap: '24px', alignItems: 'start' }}>

        {/* LEFT — Input */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '20px', position: 'sticky', top: '76px' }}>
          <h2 style={{ margin: '0 0 16px', fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Input</h2>

          <FileUpload label="Topic Keywords" sublabel="Main topic keyword list" file={topicFile} onChange={setTopicFile} required />
          <FileUpload label="Related Keywords" sublabel="Similar topic (e.g. video upscaler)" file={relatedFile} onChange={setRelatedFile} />
          <FileUpload label="Competitor Keywords" sublabel="Competitor ranked keywords" file={competitorFile} onChange={setCompetitorFile} />

          <div style={{ margin: '16px 0 12px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '5px', letterSpacing: '0.05em' }}>PAGE TYPE <span style={{ color: 'var(--accent)' }}>*</span></label>
            <select value={pageType} onChange={e => setPageType(e.target.value)} style={{ width: '100%', padding: '9px 12px', color: pageType ? 'var(--text)' : 'var(--text-muted)' }}>
              <option value="">Select page type...</option>
              {PAGE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '5px', letterSpacing: '0.05em' }}>PRIMARY KEYWORD <span style={{ color: 'var(--accent)' }}>*</span></label>
            <input type="text" placeholder="e.g. video enhancer online" value={primaryKeyword} onChange={e => setPrimaryKeyword(e.target.value)} style={{ width: '100%', padding: '9px 12px' }} />
          </div>

          <button onClick={handleGenerate} disabled={!canGenerate} style={{
            width: '100%', padding: '12px', background: canGenerate ? 'var(--accent)' : 'var(--surface-2)',
            border: 'none', color: canGenerate ? '#000' : 'var(--text-muted)',
            fontWeight: '600', fontSize: '13px', letterSpacing: '0.05em', cursor: canGenerate ? 'pointer' : 'not-allowed', borderRadius: '4px'
          }}>
            {loading ? '...' : 'Generate Strategy →'}
          </button>

          <p style={{ margin: '10px 0 0', fontSize: '10px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
            Keywords with volume &lt; 30 are auto-removed. Up to 350 sent to AI.
          </p>
        </div>

        {/* RIGHT — Results */}
        <div>
          {loading && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '48px', textAlign: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginBottom: '16px' }}>
                {[0,1,2].map(i => <span key={i} className="pulse" style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent)', display: 'block', animationDelay: `${i*0.2}s` }} />)}
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: 0 }}>{loadingMsg}</p>
            </div>
          )}

          {error && !loading && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--danger)', borderRadius: '6px', padding: '20px' }}>
              <span style={{ color: 'var(--danger)', fontSize: '12px' }}>✗ {error}</span>
            </div>
          )}

          {!loading && !result && !error && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '64px', textAlign: 'center' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: 0 }}>Upload keyword files and click Generate Strategy</p>
            </div>
          )}

          {result && !loading && (
            <div className="fade-up">
              {/* Stats */}
              {stats && (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '16px 24px', marginBottom: '16px', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' }}>
                  <StatBadge label="Total input" value={stats.total} sub={`${stats.topic}T ${stats.related}R ${stats.competitor}C`} />
                  <StatBadge label="After vol filter" value={stats.afterVolumeFilter} />
                  <StatBadge label="After dedup" value={stats.afterDedup} />
                  <StatBadge label="Brand terms" value={stats.brandTerms} />
                  <StatBadge label="Sent to AI" value={stats.sentToAI} />
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
                <button onClick={handleCopyJSON} style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: copied ? 'var(--accent)' : 'var(--text-muted)', padding: '6px 14px', fontSize: '11px', borderRadius: '4px' }}>
                  {copied ? '✓ Copied' : 'Copy JSON'}
                </button>
              </div>

              {/* Primary Keyword */}
              <div style={{ background: 'var(--surface)', border: `1px solid ${result.primary_keyword.validated ? 'var(--accent)' : 'var(--warn)'}`, borderRadius: '6px', padding: '20px', marginBottom: '16px' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: '12px' }}>
                  PRIMARY KEYWORD · {result.primary_keyword.validated ? '✓ VALIDATED' : '⚠ SWAP SUGGESTED'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
                  <span style={{ fontSize: '18px', fontWeight: '600', color: result.primary_keyword.validated ? 'var(--accent)' : 'var(--warn)' }}>
                    {result.primary_keyword.keyword}
                  </span>
                  <KdTag tag={String(result.primary_keyword.kd_tag ?? '')} />
                  <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>vol {Number(result.primary_keyword.volume).toLocaleString()}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>kd {result.primary_keyword.kd}</span>
                  {!!result.primary_keyword.intent && <span style={{ color: 'var(--accent)', fontSize: '10px', border: '1px solid var(--accent)', borderRadius: '3px', padding: '1px 6px' }}>{String(result.primary_keyword.intent)}</span>}
                  <TrendBadge trend={String(result.primary_keyword.trend_direction ?? '')} />
                  {result.primary_keyword.density != null && <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>density {Number(result.primary_keyword.density).toFixed(2)}</span>}
                  <SourceBadge source={String(result.primary_keyword.source ?? '')} />
                </div>
                {!!result.primary_keyword.combined_signal && (
                  <div style={{ fontSize: '10px', color: 'var(--accent)', marginBottom: '8px' }}>{String(result.primary_keyword.combined_signal)}</div>
                )}
                {!!result.primary_keyword.note && (
                  <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-dim)', borderTop: '1px solid var(--border)', paddingTop: '10px', lineHeight: '1.6' }}>
                    {String(result.primary_keyword.note)}
                  </p>
                )}
              </div>

              {/* Supporting Keywords */}
              <Section title="Supporting Keywords" count={result.supporting_keywords?.length ?? 0}>
                <KeywordTable rows={result.supporting_keywords ?? []} type="supporting" />
              </Section>

              {/* Longtail Keywords */}
              <Section title="Longtail Keywords" count={result.longtail_keywords?.length ?? 0}>
                <KeywordTable rows={result.longtail_keywords ?? []} type="longtail" />
              </Section>

              {/* Competitor Insights */}
              {(result.competitor_insights?.length ?? 0) > 0 && (
                <Section title="Competitor Insights" count={result.competitor_insights.length} color="var(--warn)">
                  <KeywordTable rows={result.competitor_insights} type="competitor" />
                </Section>
              )}

              {/* Missing Exports */}
              {(result.missing_exports?.length ?? 0) > 0 && (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--warn)', borderRadius: '6px', padding: '16px 20px', marginBottom: '16px' }}>
                  <div style={{ fontSize: '10px', color: 'var(--warn)', letterSpacing: '0.1em', marginBottom: '12px' }}>MISSING KEYWORD CLUSTERS DETECTED</div>
                  {result.missing_exports.map((m, i) => (
                    <div key={i} style={{ display: 'flex', gap: '12px', padding: '6px 0', borderBottom: i < result.missing_exports.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <span style={{ color: 'var(--warn)', fontSize: '11px', minWidth: '160px', fontWeight: '500' }}>"{m.topic}"</span>
                      <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{m.reason}</span>
                    </div>
                  ))}
                  <p style={{ margin: '10px 0 0', fontSize: '10px', color: 'var(--text-muted)' }}>
                    Run these as separate SEMrush exports and upload as Related Keywords to improve coverage.
                  </p>
                </div>
              )}

              {/* Page Strategy Notes */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '20px', marginBottom: '16px' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: '16px' }}>PAGE STRATEGY NOTES</div>
                {typeof result.page_strategy_notes === 'object' && result.page_strategy_notes !== null ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {[
                      { label: 'Content Format', key: 'content_format', color: 'var(--accent)' },
                      { label: 'Biggest Opportunity', key: 'biggest_opportunity', color: 'var(--tag-priority)' },
                      { label: 'Primary Risk', key: 'primary_risk', color: 'var(--warn)' },
                    ].map(({ label, key, color }) => (
                      <div key={key}>
                        <div style={{ fontSize: '10px', color, letterSpacing: '0.08em', marginBottom: '4px' }}>{label.toUpperCase()}</div>
                        <p style={{ margin: 0, color: 'var(--text-dim)', lineHeight: '1.7', fontSize: '12px', fontFamily: "'IBM Plex Sans', sans-serif" }}>
                          {String((result.page_strategy_notes as PageStrategyNotes)[key as keyof PageStrategyNotes] ?? '')}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ margin: 0, color: 'var(--text-dim)', lineHeight: '1.7', fontSize: '12px' }}>{String(result.page_strategy_notes)}</p>
                )}
              </div>

              {/* Excluded */}
              {(result.excluded_keywords?.length ?? 0) > 0 && (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
                  <button onClick={() => setShowExcluded(!showExcluded)} style={{ width: '100%', background: 'none', border: 'none', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-muted)', cursor: 'pointer' }}>
                    <span style={{ fontSize: '10px', letterSpacing: '0.1em' }}>EXCLUDED KEYWORDS ({result.excluded_keywords.length})</span>
                    <span style={{ fontSize: '11px' }}>{showExcluded ? '▲' : '▼'}</span>
                  </button>
                  {showExcluded && (
                    <div style={{ borderTop: '1px solid var(--border)', padding: '12px 20px' }}>
                      {result.excluded_keywords.map((kw, i) => (
                        <div key={i} style={{ display: 'flex', gap: '16px', padding: '6px 0', borderBottom: i < result.excluded_keywords.length - 1 ? '1px solid var(--border)' : 'none' }}>
                          <span style={{ color: 'var(--text-muted)', minWidth: '200px', fontSize: '12px' }}>{kw.keyword}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: '11px', opacity: 0.7 }}>{String(kw.reason ?? '')}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function KeywordTable({ rows, type }: { rows: KeywordResult[]; type: 'supporting' | 'longtail' | 'competitor' }) {
  if (!rows.length) return <div style={{ padding: '20px', color: 'var(--text-muted)', fontSize: '12px', textAlign: 'center' }}>None found</div>

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--surface-2)' }}>
            {['Keyword', 'Vol', 'KD', 'Tag', 'Trend', 'Source',
              type === 'supporting' ? 'CPC' : null,
              type === 'supporting' ? 'Placement' : null,
              type === 'longtail' ? 'SERP' : null,
              type === 'longtail' ? 'Format' : null,
              type === 'longtail' ? 'Use Case' : null,
              type === 'competitor' ? 'Opportunity' : null,
              type === 'supporting' ? 'Flag' : null,
            ].filter(Boolean).map(h => (
              <th key={String(h)} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.05em', fontWeight: '500', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((kw, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text)', minWidth: '160px' }}>{kw.keyword}</td>
              <td style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{Number(kw.volume ?? 0).toLocaleString()}</td>
              <td style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text-muted)' }}>{kw.kd ?? '—'}</td>
              <td style={{ padding: '10px 12px' }}>{kw.kd_tag ? <KdTag tag={String(kw.kd_tag)} /> : '—'}</td>
              <td style={{ padding: '10px 12px' }}><TrendBadge trend={String(kw.trend_direction ?? '')} /></td>
              <td style={{ padding: '10px 12px' }}><SourceBadge source={String(kw.source ?? '')} /></td>
              {type === 'supporting' && <td style={{ padding: '10px 12px', fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>${Number(kw.cpc ?? 0).toFixed(2)}</td>}
              {type === 'supporting' && <td style={{ padding: '10px 12px', fontSize: '11px', color: 'var(--text-dim)', maxWidth: '200px' }}>{String(kw.content_placement ?? '—')}</td>}
              {type === 'longtail' && <td style={{ padding: '10px 12px', fontSize: '10px', color: 'var(--text-dim)', maxWidth: '140px' }}>{String(kw.serp_features ?? '—')}</td>}
              {type === 'longtail' && <td style={{ padding: '10px 12px', fontSize: '10px', color: 'var(--accent)', maxWidth: '140px' }}>{String(kw.content_format ?? '—')}</td>}
              {type === 'longtail' && <td style={{ padding: '10px 12px', fontSize: '11px', color: 'var(--text-dim)', maxWidth: '200px' }}>{String(kw.use_case ?? '—')}</td>}
              {type === 'competitor' && <td style={{ padding: '10px 12px', fontSize: '11px', color: 'var(--text-dim)', maxWidth: '240px' }}>{String(kw.opportunity ?? '—')}</td>}
              {type === 'supporting' && <td style={{ padding: '10px 12px', fontSize: '10px', color: 'var(--warn)', maxWidth: '160px' }}>{kw.flag ? String(kw.flag) : '—'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
