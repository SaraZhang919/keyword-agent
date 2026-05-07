'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

// ─── Types ─────────────────────────────────────────────────────────────────
type Section = {
  id: number
  label: string
  file: File | null
}

type Stats = {
  total: number
  afterVolumeFilter: number
  afterDedup: number
  sentToAI: number
  bySource: Record<string, number>
}

const MAX_SECTIONS = 5

const PAGE_TYPES = [
  'Product Page',
  'Category Page',
  'Blog / Article',
  'Landing Page',
  'Homepage',
  'FAQ Page',
  'Pillar Page',
  'Location Page',
]

// ─── Component ─────────────────────────────────────────────────────────────
export default function ToolPage() {
  const router = useRouter()

  // Auth
  const [password, setPassword]   = useState('')
  const [authed, setAuthed]       = useState(false)
  const [authError, setAuthError] = useState('')

  // Form
  const [pageType, setPageType]           = useState(PAGE_TYPES[0])
  const [primaryKeyword, setPrimaryKeyword] = useState('')
  const [sections, setSections]           = useState<Section[]>([
    { id: 0, label: 'Topic Keywords',      file: null },
    { id: 1, label: 'Related Keywords',    file: null },
    { id: 2, label: 'Competitor Keywords', file: null },
  ])

  // State
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [result, setResult]     = useState<Record<string, unknown> | null>(null)
  const [stats, setStats]       = useState<Stats | null>(null)

  const fileRefs = useRef<(HTMLInputElement | null)[]>([])

  // ── Auth ──────────────────────────────────────────────────────────────────
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, type: 'tool' }),
    })
    if (res.ok) setAuthed(true)
    else setAuthError('Invalid password')
  }

  // ── Section management ────────────────────────────────────────────────────
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

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setResult(null)
    setStats(null)

    const filledSections = sections.filter(s => s.file)
    if (filledSections.length === 0) {
      setError('Please upload at least one keyword file.')
      return
    }
    if (!primaryKeyword.trim()) {
      setError('Please enter a primary keyword.')
      return
    }

    setLoading(true)

    const formData = new FormData()
    formData.append('pageType', pageType)
    formData.append('primaryKeyword', primaryKeyword.trim())

    // Index only filled sections so the backend gets contiguous 0..N keys
    let idx = 0
    for (const section of sections) {
      if (!section.file) continue
      formData.append(`file_${idx}`, section.file)
      formData.append(`label_${idx}`, section.label)
      idx++
    }

    try {
      const res = await fetch('/api/generate', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong.')
      } else {
        setResult(data.result)
        setStats(data.stats)
      }
    } catch {
      setError('Network error — check your connection.')
    } finally {
      setLoading(false)
    }
  }

  function resetForm() {
    setResult(null)
    setStats(null)
    setError('')
    setSections(prev => prev.map(s => ({ ...s, file: null })))
    fileRefs.current.forEach(ref => { if (ref) ref.value = '' })
  }

  // ── Login gate ────────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)'
      }}>
        <div style={{ width: '320px' }}>
          <div style={{ marginBottom: '32px' }}>
            <h1 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '6px' }}>
              Keyword Strategy Agent
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Internal SEO tool</p>
          </div>
          <form onSubmit={handleLogin}>
            <input
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoFocus
              style={{ width: '100%', padding: '10px 14px', marginBottom: '12px' }}
            />
            {authError && (
              <p style={{ color: 'var(--danger)', fontSize: '12px', marginBottom: '10px' }}>
                {authError}
              </p>
            )}
            <button
              type="submit"
              disabled={!password}
              style={{
                width: '100%', padding: '10px', background: 'var(--accent)',
                border: 'none', color: '#000', fontWeight: '600',
                cursor: password ? 'pointer' : 'not-allowed',
                opacity: password ? 1 : 0.5, borderRadius: '4px'
              }}
            >
              Enter →
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ── Main UI ───────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>

      {/* Header */}
      <header style={{
        borderBottom: '1px solid var(--border)', padding: '0 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '52px'
      }}>
        <span style={{ fontWeight: '600', fontSize: '14px', letterSpacing: '0.02em' }}>
          Keyword Strategy Agent
        </span>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <button
            onClick={() => router.push('/admin')}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '11px', padding: 0 }}
          >
            Admin
          </button>
          <button
            onClick={async () => { await fetch('/api/logout', { method: 'POST' }); setAuthed(false) }}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '11px', padding: 0 }}
          >
            Logout
          </button>
        </div>
      </header>

      <div style={{ maxWidth: '780px', margin: '0 auto', padding: '36px 24px' }}>

        {/* ── Results view ── */}
        {result ? (
          <ResultsView result={result} stats={stats} onReset={resetForm} />
        ) : (

          /* ── Form ── */
          <form onSubmit={handleSubmit}>

            {/* Row: Page type + Primary keyword */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '28px' }}>
              <div>
                <Label>Page Type</Label>
                <select
                  value={pageType}
                  onChange={e => setPageType(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px' }}
                >
                  {PAGE_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <Label>Primary Keyword</Label>
                <input
                  type="text"
                  placeholder="e.g. project management software"
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
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '12px',
                background: loading ? 'var(--surface)' : 'var(--accent)',
                border: loading ? '1px solid var(--border)' : 'none',
                color: loading ? 'var(--text-muted)' : '#000',
                fontWeight: '600', fontSize: '13px',
                cursor: loading ? 'not-allowed' : 'pointer',
                letterSpacing: '0.02em'
              }}
            >
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <span className="pulse">●</span> Analysing keywords…
                </span>
              ) : (
                'Run Keyword Strategy →'
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

// ─── Section Row ────────────────────────────────────────────────────────────
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
      {/* Section label */}
      <input
        type="text"
        value={section.label}
        onChange={e => onLabelChange(e.target.value)}
        placeholder={`Section ${index + 1} name`}
        style={{ padding: '7px 10px', fontSize: '12px' }}
      />

      {/* File picker */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: '4px', padding: '6px 12px', cursor: 'pointer',
          fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap',
          transition: 'border-color 0.15s'
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

      {/* Remove button */}
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

// ─── Results View ───────────────────────────────────────────────────────────
function ResultsView({
  result, stats, onReset
}: {
  result: Record<string, unknown>
  stats: Stats | null
  onReset: () => void
}) {
  return (
    <div className="fade-up">
      {/* Stats bar */}
      {stats && (
        <div style={{
          display: 'flex', gap: '24px', flexWrap: 'wrap',
          marginBottom: '28px', paddingBottom: '20px',
          borderBottom: '1px solid var(--border)'
        }}>
          <Stat label="Total uploaded" value={stats.total} />
          <Stat label="After vol filter" value={stats.afterVolumeFilter} />
          <Stat label="After dedup" value={stats.afterDedup} />
          <Stat label="Sent to AI" value={stats.sentToAI} accent />
          {Object.entries(stats.bySource).map(([label, count]) => (
            <Stat key={label} label={label} value={count} />
          ))}
        </div>
      )}

      {/* Rendered result fields */}
      {Object.entries(result).map(([key, value]) => (
        <ResultSection key={key} fieldKey={key} value={value} />
      ))}

      <button
        onClick={onReset}
        style={{
          marginTop: '32px', padding: '10px 24px',
          background: 'var(--surface)', border: '1px solid var(--border)',
          color: 'var(--text)', fontSize: '12px', cursor: 'pointer'
        }}
      >
        ← New Analysis
      </button>
    </div>
  )
}

function ResultSection({ fieldKey, value }: { fieldKey: string; value: unknown }) {
  const title = fieldKey
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())

  return (
    <div style={{ marginBottom: '28px' }}>
      <div style={{
        fontSize: '10px', letterSpacing: '0.12em', color: 'var(--text-muted)',
        marginBottom: '12px', textTransform: 'uppercase'
      }}>
        {title}
      </div>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: '6px', padding: '16px 20px'
      }}>
        <RenderValue value={value} />
      </div>
    </div>
  )
}

function RenderValue({ value }: { value: unknown }) {
  if (typeof value === 'string') {
    return <p style={{ margin: 0, lineHeight: '1.7', fontSize: '13px' }}>{value}</p>
  }
  if (Array.isArray(value)) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {value.map((item, i) => (
          <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
            {typeof item === 'object' && item !== null ? (
              <ObjectChip obj={item as Record<string, unknown>} />
            ) : (
              <>
                <span style={{ color: 'var(--accent)', minWidth: '16px', fontSize: '11px', paddingTop: '2px' }}>›</span>
                <span style={{ fontSize: '13px' }}>{String(item)}</span>
              </>
            )}
          </div>
        ))}
      </div>
    )
  }
  if (typeof value === 'object' && value !== null) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', gap: '10px', fontSize: '13px' }}>
            <span style={{ color: 'var(--text-muted)', minWidth: '140px', fontSize: '11px' }}>{k}:</span>
            <span>{String(v)}</span>
          </div>
        ))}
      </div>
    )
  }
  return <span style={{ fontSize: '13px' }}>{String(value)}</span>
}

function ObjectChip({ obj }: { obj: Record<string, unknown> }) {
  const entries = Object.entries(obj)
  const main = entries[0]
  const rest = entries.slice(1)
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--accent)', fontSize: '11px' }}>›</span>
        <span style={{ fontSize: '13px', fontWeight: '500' }}>{String(main?.[1] ?? '')}</span>
        {rest.map(([k, v]) => (
          <span key={k} style={{
            fontSize: '10px', color: 'var(--text-muted)',
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            borderRadius: '3px', padding: '1px 7px'
          }}>
            {k}: {String(v)}
          </span>
        ))}
      </div>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div>
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
