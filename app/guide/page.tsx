'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type PromptResponse = {
  prompt: string
  isDefault: boolean
  kvUnavailable?: boolean
}

const decisionPatterns = [
  {
    title: 'Primary Keyword',
    pattern: 'Choose the best single target keyword for the current page.',
    checks: 'Intent fit, volume, KD realism, relevance to page type, and whether the term can represent the page.',
    optimize: 'Tune this when the tool picks a keyword that is too broad, too weak, or not aligned with the page job.',
  },
  {
    title: 'Supporting Keywords',
    pattern: 'Find close semantic helpers that belong inside the same page.',
    checks: 'Same or strongly related intent, natural section placement, no competitor/brand misuse, and useful topical coverage.',
    optimize: 'Tune this when same-page terms are too loose, too repetitive, or missing from section recommendations.',
  },
  {
    title: 'Longtail Keywords',
    pattern: 'Capture narrower searches the same page can answer.',
    checks: 'Question, how-to, use-case, SERP, tutorial, or comparison intent that can fit FAQ/body content.',
    optimize: 'Tune this when you want more practical article angles or fewer marginal low-intent variants.',
  },
  {
    title: 'New Page Opportunities',
    pattern: 'Scan all keywords for clusters that deserve their own future page.',
    checks: 'Topic cluster, intent, task, audience, content format, platform, or product/function signal. It does not depend on the current page.',
    optimize: 'Tune this when the tool misses GEO pages, online tools, docs, use-case pages, or product-function ideas.',
  },
  {
    title: 'Article Idea Expansions',
    pattern: 'Generate audience-aware article ideas when a specific target audience is selected.',
    checks: 'Audience pain, trigger moment, current workaround, content angle, product connection, and trust/proof needed.',
    optimize: 'Tune this when ideas feel generic, not audience-specific, or disconnected from real workflow pain.',
  },
  {
    title: 'Competitor Insights',
    pattern: 'Move competitor or brand demand into a separate insight area.',
    checks: 'Brand names, alternatives, comparisons, competitor capture intent, and pages that should not use brand terms as primary/supporting keywords.',
    optimize: 'Tune this when brand terms leak into main keyword recommendations or comparison opportunities are missed.',
  },
  {
    title: 'Missing Exports',
    pattern: 'Flag important keyword clusters that appear absent from the uploaded or pasted data.',
    checks: 'Expected modifier groups, formats, competitor sets, use-case clusters, or language/topic gaps.',
    optimize: 'Tune this when you want stronger data-quality warnings before trusting the strategy.',
  },
  {
    title: 'Excluded Keywords',
    pattern: 'Explain why visible keywords were not used.',
    checks: 'Wrong intent, weak relevance, duplicate-like pattern, risky brand term, low usefulness, or poor fit for the page strategy.',
    optimize: 'Tune this when the model is excluding keywords you consider strategically important.',
  },
]

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: '6px',
      padding: '18px 20px',
      marginBottom: '16px',
    }}>
      <h2 style={{
        fontSize: '12px',
        letterSpacing: '0.1em',
        color: 'var(--accent)',
        margin: '0 0 12px',
        textTransform: 'uppercase',
      }}>{title}</h2>
      {children}
    </section>
  )
}

function SmallLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      color: 'var(--text-muted)',
      fontSize: '10px',
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
    }}>{children}</span>
  )
}

export default function GuidePage() {
  const router = useRouter()
  const [promptData, setPromptData] = useState<PromptResponse | null>(null)
  const [promptError, setPromptError] = useState('')
  const [loadingPrompt, setLoadingPrompt] = useState(false)
  const [showPrompt, setShowPrompt] = useState(false)

  useEffect(() => {
    async function loadPrompt() {
      setLoadingPrompt(true)
      setPromptError('')
      try {
        const res = await fetch('/api/prompt')
        if (!res.ok) throw new Error('Could not load prompt')
        const data = await res.json()
        setPromptData(data)
      } catch {
        setPromptError('Could not load the active prompt. You can still review the decision guide below.')
      } finally {
        setLoadingPrompt(false)
      }
    }

    loadPrompt()
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header style={{
        borderBottom: '1px solid var(--border)', padding: '0 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: '52px', position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => router.push('/tool')} style={{
            background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '12px'
          }}>Back to Tool</button>
          <span style={{ color: 'var(--border)' }}>|</span>
          <span style={{ fontWeight: '600', fontSize: '14px' }}>Tool Logic Guide</span>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button onClick={() => router.push('/admin')} style={{
            background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)',
            padding: '5px 12px', fontSize: '11px'
          }}>Admin</button>
        </div>
      </header>

      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '34px 24px 48px' }}>
        <div className="fade-up">
          <div style={{ marginBottom: '24px' }}>
            <SmallLabel>Reference page</SmallLabel>
            <h1 style={{ fontSize: '24px', lineHeight: 1.25, margin: '8px 0 10px' }}>
              Keyword Strategy Agent Logic
            </h1>
            <p style={{ color: 'var(--text-dim)', maxWidth: '760px', margin: 0, fontSize: '13px' }}>
              Use this page while running analysis to understand what the tool is doing, why each recommendation appears,
              and where to optimize the prompt later.
            </p>
          </div>

          <Card title="What This Tool Does">
            <p style={{ color: 'var(--text-dim)', margin: 0 }}>
              The tool turns keyword exports or pasted keyword rows into a page-level SEO strategy. It validates the
              current page target, finds same-page keyword support, identifies future page opportunities, and can expand
              article ideas for a selected audience.
            </p>
          </Card>

          <Card title="Input Sources">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
              <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '4px', padding: '12px' }}>
                <SmallLabel>File upload</SmallLabel>
                <p style={{ margin: '6px 0 0', color: 'var(--text-dim)' }}>
                  CSV/XLSX exports with Keyword and Volume columns. Optional KD and CPC columns are used when present.
                </p>
              </div>
              <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '4px', padding: '12px' }}>
                <SmallLabel>Paste rows</SmallLabel>
                <p style={{ margin: '6px 0 0', color: 'var(--text-dim)' }}>
                  Paste rows as keyword, volume, KD. Spreadsheet-style tab-separated rows are supported, including volumes like 12,100.
                </p>
              </div>
            </div>
          </Card>

          <Card title="Pre-Filter Logic">
            <ol style={{ margin: 0, paddingLeft: '18px', color: 'var(--text-dim)' }}>
              <li>Merge all uploaded and pasted keyword rows under their section labels.</li>
              <li>Remove keywords with volume below 30.</li>
              <li>Deduplicate by normalized keyword and keep the highest-volume version.</li>
              <li>Sort by volume descending.</li>
              <li>Send at most 300 keywords to the LLM.</li>
            </ol>
          </Card>

          <Card title="LLM Data Flow">
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
              gap: '10px',
            }}>
              {['Form inputs', 'Merged keyword list', 'Active prompt', 'OpenAI JSON result', 'UI + Markdown report'].map((step, i) => (
                <div key={step} style={{
                  background: i === 2 ? 'var(--accent-dim)' : 'var(--surface-2)',
                  border: `1px solid ${i === 2 ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: '4px',
                  padding: '12px',
                  minHeight: '74px',
                }}>
                  <SmallLabel>Step {i + 1}</SmallLabel>
                  <div style={{ marginTop: '6px', color: 'var(--text)' }}>{step}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Decision Patterns">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
              {decisionPatterns.map(item => (
                <div key={item.title} style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  padding: '14px',
                }}>
                  <h3 style={{ margin: '0 0 8px', fontSize: '13px', color: 'var(--text)' }}>{item.title}</h3>
                  <p style={{ margin: '0 0 8px', color: 'var(--text-dim)' }}>{item.pattern}</p>
                  <p style={{ margin: '0 0 8px', color: 'var(--text-muted)', fontSize: '11px' }}>
                    <strong style={{ color: 'var(--text-dim)' }}>Checks:</strong> {item.checks}
                  </p>
                  <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '11px' }}>
                    <strong style={{ color: 'var(--text-dim)' }}>Optimize when:</strong> {item.optimize}
                  </p>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Optimization Notes">
            <ul style={{ margin: 0, paddingLeft: '18px', color: 'var(--text-dim)' }}>
              <li>Use the guide to identify which result section needs tuning before editing the prompt.</li>
              <li>Use Admin to change the prompt; this guide is read-only.</li>
              <li>If article ideas do not appear, check that Target Audience is not All / Undefined.</li>
              <li>If new page opportunities are weak, tune cluster rules around intent, task, format, platform, audience, or product function.</li>
            </ul>
          </Card>

          <Card title="Full Active Prompt">
            <p style={{ color: 'var(--text-dim)', margin: '0 0 12px' }}>
              This shows the active prompt returned by the prompt API. If a valid saved prompt exists, it appears here;
              otherwise the default prompt is shown. Prompt edits are managed from Admin.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: showPrompt ? '12px' : 0 }}>
              <button onClick={() => setShowPrompt(prev => !prev)} style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                color: 'var(--text-muted)',
                padding: '7px 12px',
                fontSize: '11px',
              }}>
                {showPrompt ? 'Hide Prompt' : 'Show Prompt'}
              </button>
              {loadingPrompt && <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Loading prompt...</span>}
              {promptData && (
                <span style={{ color: promptData.isDefault ? 'var(--text-muted)' : 'var(--accent)', fontSize: '11px' }}>
                  {promptData.isDefault ? 'Using default prompt' : 'Using saved prompt'}
                  {promptData.kvUnavailable ? ' / KV unavailable' : ''}
                </span>
              )}
              {promptError && <span style={{ color: 'var(--danger)', fontSize: '11px' }}>{promptError}</span>}
            </div>
            {showPrompt && (
              <pre style={{
                margin: 0,
                maxHeight: '560px',
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                background: '#080808',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                padding: '14px',
                color: 'var(--text-dim)',
                fontSize: '11px',
                lineHeight: 1.55,
              }}>{promptData?.prompt || 'Prompt not loaded.'}</pre>
            )}
          </Card>
        </div>
      </main>
    </div>
  )
}
