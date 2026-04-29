'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

const PAGE_TYPES = [
  'Feature Page',
  'Online Tool Page',
  'Blog Post',
  'GEO Page',
  'Docs Page',
]

interface KeywordResult {
  keyword: string; volume: number; kd: number; kd_tag: string
  content_placement?: string; use_case?: string; note?: string; reason?: string; validated?: boolean
  [key: string]: unknown
}

interface PageStrategyNotes {
  content_format: string
  biggest_opportunity: string
  primary_risk: string
}

interface StrategyResult {
  primary_keyword: KeywordResult & { validated: boolean; note: string }
  supporting_keywords: KeywordResult[]
  longtail_keywords: KeywordResult[]
  excluded_keywords: KeywordResult[]
  page_strategy_notes: PageStrategyNotes | string
}

interface Stats { total: number; afterVolumeFilter: number; afterDedup: number; sentToAI: number }

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

function StatBadge({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '18px', fontWeight: '600', color: 'var(--accent)' }}>{value.toLocaleString()}</div>
      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>{label}</div>
    </div>
  )
}

export default function ToolPage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
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
    if (!file || !pageType || !primaryKeyword) return
    setLoading(true)
    setError('')
    setResult(null)

    const msgs = [
      'Parsing CSV...',
      'Pre-filtering keywords...',
      'Sending to Claude...',
      'Building keyword strategy...',
    ]
    let i = 0
    setLoadingMsg(msgs[0])
    const interval = setInterval(() => {
      i = (i + 1) % msgs.length
      setLoadingMsg(msgs[i])
    }, 2000)

    const form = new FormData()
    form.append('file', file)
    form.append('pageType', pageType)
    form.append('primaryKeyword', primaryKeyword)

    const res = await fetch('/api/generate', { method: 'POST', body: form })
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

  const canGenerate = !!file && !!pageType && !!primaryKeyword && !loading

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
          <button onClick={handleLogout} style={{
            background: 'none', border: 'none', color: 'var(--text-muted)', padding: '5px'
          }}>Logout</button>
        </div>
      </header>

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 24px', display: 'grid', gridTemplateColumns: '340px 1fr', gap: '24px', alignItems: 'start' }}>

        {/* LEFT — Input Form */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '24px', position: 'sticky', top: '76px' }}>
          <h2 style={{ margin: '0 0 20px', fontSize: '13px', fontWeight: '600', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Input
          </h2>

          {/* File Upload */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', letterSpacing: '0.05em' }}>
              SEMRUSH CSV
            </label>
            <div
              onClick={() => fileRef.current?.click()}
              style={{
                border: `1px dashed ${file ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: '4px', padding: '16px', textAlign: 'center', cursor: 'pointer',
                background: file ? 'var(--accent-dim)' : 'var(--surface-2)',
                transition: 'all 0.15s'
              }}
            >
              {file ? (
                <div>
                  <div style={{ color: 'var(--accent)', fontSize: '12px', fontWeight: '500' }}>✓ {file.name}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '10px', marginTop: '2px' }}>
                    {(file.size / 1024).toFixed(0)} KB · Click to change
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Upload CSV</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '10px', marginTop: '2px' }}>SEMrush keyword export</div>
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }}
              onChange={e => setFile(e.target.files?.[0] ?? null)} />
          </div>

          {/* Page Type */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', letterSpacing: '0.05em' }}>
              PAGE TYPE
            </label>
            <select
              value={pageType}
              onChange={e => setPageType(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', color: pageType ? 'var(--text)' : 'var(--text-muted)' }}
            >
              <option value="">Select page type...</option>
              {PAGE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Primary Keyword */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', letterSpacing: '0.05em' }}>
              PRIMARY KEYWORD
            </label>
            <input
              type="text"
              placeholder="e.g. video enhancer online"
              value={primaryKeyword}
              onChange={e => setPrimaryKeyword(e.target.value)}
              style={{ width: '100%', padding: '9px 12px' }}
            />
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={!canGenerate}
            style={{
              width: '100%', padding: '12px',
              background: canGenerate ? 'var(--accent)' : 'var(--surface-2)',
              border: 'none', color: canGenerate ? '#000' : 'var(--text-muted)',
              fontWeight: '600', fontSize: '13px', letterSpacing: '0.05em',
              cursor: canGenerate ? 'pointer' : 'not-allowed',
            }}
          >
            {loading ? '...' : 'Generate Strategy →'}
          </button>

          {/* Helper text */}
          <p style={{ margin: '12px 0 0', fontSize: '10px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
            Keywords with volume &lt; 30 are automatically removed. Top 300 by volume are sent to AI.
          </p>
        </div>

        {/* RIGHT — Results */}
        <div>
          {/* Loading State */}
          {loading && (
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px',
              padding: '48px', textAlign: 'center'
            }}>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginBottom: '16px' }}>
                {[0, 1, 2].map(i => (
                  <span key={i} className="pulse" style={{
                    width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent)',
                    display: 'block', animationDelay: `${i * 0.2}s`
                  }} />
                ))}
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: 0 }}>{loadingMsg}</p>
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--danger)', borderRadius: '6px', padding: '20px'
            }}>
              <span style={{ color: 'var(--danger)', fontSize: '12px' }}>✗ Error: {error}</span>
            </div>
          )}

          {/* Empty State */}
          {!loading && !result && !error && (
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px',
              padding: '64px', textAlign: 'center'
            }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: 0 }}>
                Fill in the inputs and click Generate Strategy
              </p>
            </div>
          )}

          {/* Results */}
          {result && !loading && (
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
                  <StatBadge label="Sent to AI" value={stats.sentToAI} />
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
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
                  <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>vol {result.primary_keyword.volume.toLocaleString()}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>kd {result.primary_keyword.kd}</span>
                  {result.primary_keyword.intent && (
                    <span style={{ color: 'var(--accent)', fontSize: '10px', border: '1px solid var(--accent)', borderRadius: '3px', padding: '1px 6px' }}>
                      {String(result.primary_keyword.intent)}
                    </span>
                  )}
                  {result.primary_keyword.trend_direction && (
                    <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                      {String(result.primary_keyword.trend_direction) === 'Rising' ? '↑' : String(result.primary_keyword.trend_direction) === 'Declining' ? '↓' : '→'} {String(result.primary_keyword.trend_direction)}
                    </span>
                  )}
                  {result.primary_keyword.density !== undefined && (
                    <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>density {Number(result.primary_keyword.density).toFixed(2)}</span>
                  )}
                </div>
                {result.primary_keyword.note && (
                  <p style={{ margin: '10px 0 0', fontSize: '11px', color: 'var(--text-dim)', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
                    {result.primary_keyword.note}
                  </p>
                )}
              </div>

              {/* Supporting Keywords */}
              <Section title="Supporting Keywords" count={result.supporting_keywords.length}>
                <Table
                  rows={result.supporting_keywords}
                  extraCol={{ header: 'Placement', key: 'content_placement' }}
                  showCpc={true}
                />
              </Section>

              {/* Longtail Keywords */}
              <Section title="Longtail Keywords" count={result.longtail_keywords.length}>
                <Table
                  rows={result.longtail_keywords}
                  extraCol={{ header: 'Use Case', key: 'use_case' }}
                  showSerp={true}
                />
              </Section>

              {/* Page Strategy Notes */}
              <div style={{
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px',
                padding: '20px', marginBottom: '16px'
              }}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: '16px' }}>
                  PAGE STRATEGY NOTES
                </div>
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
                  <p style={{ margin: 0, color: 'var(--text-dim)', lineHeight: '1.7', fontSize: '12px', fontFamily: "'IBM Plex Sans', sans-serif" }}>
                    {String(result.page_strategy_notes)}
                  </p>
                )}
              </div>

              {/* Excluded Keywords (collapsible) */}
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
          )}
        </div>
      </div>
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

function TrendBadge({ trend }: { trend: string }) {
  if (!trend || trend === 'N/A') return <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>—</span>
  // Detect rising/falling from comma-separated trend values
  const vals = trend.split(',').map(Number).filter(n => !isNaN(n))
  if (vals.length >= 3) {
    const first = vals.slice(0, 3).reduce((a, b) => a + b, 0) / 3
    const last  = vals.slice(-3).reduce((a, b) => a + b, 0) / 3
    if (last > first * 1.1) return <span style={{ color: 'var(--tag-priority)', fontSize: '10px' }}>↑ rising</span>
    if (last < first * 0.9) return <span style={{ color: 'var(--danger)', fontSize: '10px' }}>↓ falling</span>
  }
  return <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>→ stable</span>
}

function Table({ rows, extraCol, showCpc, showSerp }: {
  rows: (KeywordResult & Record<string, unknown>)[]
  extraCol: { header: string; key: string }
  showCpc?: boolean
  showSerp?: boolean
}) {
  const headers = ['Keyword', 'Vol', 'KD', 'Tag', 'Intent', 'Trend']
  if (showCpc) headers.push('CPC')
  if (showSerp) headers.push('SERP Features')
  headers.push(extraCol.header)

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--surface-2)' }}>
            {headers.map(h => (
              <th key={h} style={{
                padding: '8px 12px', textAlign: 'left', fontSize: '10px',
                color: 'var(--text-muted)', letterSpacing: '0.05em', fontWeight: '500',
                borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap'
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((kw, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text)', minWidth: '160px' }}>{kw.keyword}</td>
              <td style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{Number(kw.volume)?.toLocaleString()}</td>
              <td style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text-muted)' }}>{kw.kd}</td>
              <td style={{ padding: '10px 12px' }}><KdTag tag={kw.kd_tag} /></td>
              <td style={{ padding: '10px 12px', fontSize: '10px', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{String(kw.intent ?? '—')}</td>
              <td style={{ padding: '10px 12px' }}><TrendBadge trend={String(kw.trend ?? '')} /></td>
              {showCpc && <td style={{ padding: '10px 12px', fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>${Number(kw.cpc ?? 0).toFixed(2)}</td>}
              {showSerp && <td style={{ padding: '10px 12px', fontSize: '10px', color: 'var(--text-dim)', maxWidth: '160px' }}>{String(kw.serp_features ?? '—')}</td>}
              <td style={{ padding: '10px 12px', fontSize: '11px', color: 'var(--text-dim)', maxWidth: '220px' }}>
                {String(kw[extraCol.key] ?? '')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
