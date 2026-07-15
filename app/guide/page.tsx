'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type PromptResponse = {
  prompt: string
  brandScope: string
  isDefault: boolean
  kvUnavailable?: boolean
}

const decisionPatterns = [
  {
    title: 'Primary Keyword',
    pattern: 'Choose the strongest realistic target keyword for the current page. The submitted keyword is only a candidate, not automatically the final target.',
    criteria: [
      'Use only IDs classified as current-page fit; every metric-backed choice must include a valid keyword_id from parsed data.',
      'Reject brand terms and current_page_gap competitor keywords as primary targets unless the page type is explicitly a comparison/blog angle.',
      'Judge intent fit first: the searcher goal must match what the selected page type can satisfy.',
      'Judge page-type fit using floors: Tool 500+ volume with transactional/commercial intent; Feature 200+ commercial intent; Blog 100+ informational/commercial intent; GEO 50+ with location modifier; Docs 30+ informational intent.',
      'Prefer the highest-volume keyword that still has realistic ranking potential for DA<30.',
      'KD realism: Priority KD<40 is strongest; Mid-term KD40-80 is allowed only when intent/page fit and volume justify it; Long-term KD>80 is usually avoided.',
      'Density is a risk modifier: density >0.7 means strong paid competition, but not automatic exclusion.',
      'Trend check: Declining plus volume <100 is rejected unless strategically important.',
      'SERP reality: lower priority if the SERP format does not match the page type.',
    ],
    optimize: 'Tune this when the tool picks a keyword that is too broad, too weak, or not aligned with the page job.',
  },
  {
    title: 'Supporting Keywords',
    pattern: 'Find 5-10 same-page keywords that deepen the current page, not separate future pages.',
    criteria: [
      'Use only current_page_ids. Source roles add evidence but cannot make a different task fit the page.',
      'Exclude brand terms and competitor-gap terms from same-page support unless the page is a comparison/blog page.',
      'Prioritize Priority KD<40 keywords.',
      'Allow realistic Mid-term KD40-80 variants when volume, intent, and exact page-task fit justify them; do not suppress a useful variant by an arbitrary quota.',
      'Exclude Long-term KD>80 keywords.',
      'Prefer exact page-relevant broad_match terms first, then custom rows when they add semantic depth.',
      'Keep keywords close enough to fit naturally into page sections, FAQs, feature blocks, or comparison notes.',
      'Avoid keywords that imply a different product class or a separate page intent.',
    ],
    optimize: 'Tune this when same-page terms are too loose, too repetitive, or missing from section recommendations.',
  },
  {
    title: 'Longtail Keywords',
    pattern: 'Select 5-15 narrower searches the current page can answer without becoming a separate page.',
    criteria: [
      'Use only current_page_ids for unanswered current-page questions, modifiers, and workflows.',
      'Prefer question, how-to, use-case, tutorial, SERP-feature, and specific workflow queries.',
      'Informational longtails can win even with slightly worse KD if Featured Snippet, People Also Ask, or AI Overview opportunity is strong.',
      'Competitor/brand longtails are allowed only for Blog comparison, alternative, or migration intent.',
      'Map SERP features to content format: Featured Snippet needs a direct answer; People Also Ask needs H3 Q&A; Video carousel suggests video content; AI Overview suggests citation-ready sections.',
      'Avoid declining low-volume terms unless strategically important.',
    ],
    optimize: 'Tune this when you want more practical article angles or fewer marginal low-intent variants.',
  },
  {
    title: 'New Page Opportunities',
    pattern: 'Scan all keywords for clusters that deserve their own future page, independent of the current page.',
    criteria: [
      'Use only new_page_ids. Page/topic/page type context can validate a cluster, but cannot create an opportunity by itself.',
      'Cluster by topic, intent, user task, audience, content format, platform, or product/function signal.',
      'Use the best provided keyword as the page primary keyword and include primary_keyword_id; do not invent keyword metrics.',
      'Include 2-5 provided supporting keywords when available.',
      'Suggest Product, Feature, Online Tool, Blog, GEO, Comparison, Use-case, Docs, or Template/Resource pages from the query intent and the persistent Brand Strategy Scope.',
      'Explain why the cluster deserves its own page instead of being folded into the current page.',
      'Translate the pattern into a product_or_function_idea only when there is a clear user job.',
      'Prioritize by intent fit, volume signal, KD realism, commercial value, and content feasibility.',
    ],
    optimize: 'Tune this when the tool misses GEO pages, online tools, docs, use-case pages, or product-function ideas.',
  },
  {
    title: 'Article Idea Expansions',
    pattern: 'Generate 3-8 audience-aware article ideas only when a specific target audience is selected.',
    criteria: [
      'If Target Audience is All / Undefined or blank, return an empty array.',
      'Use keyword, topic, new-page, product/function, competitor, and corroborated seed signals as idea seeds.',
      'Focus on Blog Post, GEO Page, Docs Page, Use-case Article, and Comparison Article.',
      'For each idea, explain why the audience needs it, pain points, trigger moment, current workaround, better solution angle, outline, proof needed, and product connection.',
      'Prefer practical audience-pain-led angles over generic SEO titles.',
      'Do not invent keyword metrics.',
    ],
    optimize: 'Tune this when ideas feel generic, not audience-specific, or disconnected from real workflow pain.',
  },
  {
    title: 'Competitor Insights',
    pattern: 'Move competitor or brand demand into a separate strategy insight area.',
    criteria: [
      'current_page_gap rows with competitor domain columns are discovery signals, not default primary SEO targets.',
      'Never use competitor-gap rows as primary or supporting keywords unless the page type and intent justify a comparison/alternative page.',
      'Never use brand:yes keywords as primary or supporting keywords.',
      'Use competitor keywords to reveal demand around alternatives, comparisons, migration, and future blog/comparison pages.',
      'Allow competitor/brand terms in longtail only for Blog comparison or alternative pages, and flag them clearly.',
    ],
    optimize: 'Tune this when brand terms leak into main keyword recommendations or comparison opportunities are missed.',
  },
  {
    title: 'Missing Exports',
    pattern: 'Flag missing data clusters that could change the recommendation quality.',
    criteria: [
      'Look for absent but expected modifier groups, formats, competitor sets, use-case clusters, language variants, platform terms, or seed phrases without measured corroboration.',
      'Recommend missing exports when the available data is too narrow to validate a strong primary or page cluster.',
      'Use this as a data-quality warning, not as a keyword invention area.',
      'Limit to the highest-impact missing clusters.',
    ],
    optimize: 'Tune this when you want stronger data-quality warnings before trusting the strategy.',
  },
  {
    title: 'Excluded Keywords',
    pattern: 'Explain why visible keywords were intentionally not used.',
    criteria: [
      'Exclude wrong-intent terms that do not match the page type or product outcome.',
      'Exclude terms that clearly belong to another product class, such as downloader, streaming, codec pack, torrent, or hardware-only terms.',
      'Exclude Long-term KD>80 terms from same-page/supporting decisions.',
      'Exclude declining low-volume terms unless strategically important.',
      'Move brand/competitor terms to competitor insights instead of using them as main targets.',
      'Use exclusion notes to make tradeoffs auditable.',
    ],
    optimize: 'Tune this when the model is excluding keywords you consider strategically important.',
  },
]

const globalRankingRules = [
  'Intent fit',
  'Page-type fit',
  'Volume',
  'KD',
  'Density',
  'Trend direction',
  'Source role',
  'SERP feature opportunity',
]

const metricRules = [
  'Priority: KD<40, best realistic target for DA<30.',
  'Mid-term: KD40-80, acceptable only when intent fit, page fit, and volume justify it.',
  'Long-term: KD>80, future-only or lowest priority.',
  'Density <0.3 is low paid competition; 0.3-0.6 is moderate; >0.6 is high commercial saturation.',
  'High density is not automatic exclusion, but it matters more for transactional and commercial pages.',
  'Trend is Rising when recent average is more than 10% above early average; Declining when more than 10% below; otherwise Stable.',
  'Any keyword metric shown in the UI must come from a parsed row by keyword_id; unsupported AI ideas have metrics removed.',
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
  const [adminPassword, setAdminPassword] = useState('')
  const [authed, setAuthed] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [authError, setAuthError] = useState('')
  const [promptData, setPromptData] = useState<PromptResponse | null>(null)
  const [promptError, setPromptError] = useState('')
  const [loadingPrompt, setLoadingPrompt] = useState(false)
  const [showPrompt, setShowPrompt] = useState(false)

  async function handleAdminLogin(e: React.FormEvent) {
    e.preventDefault()
    setAuthError('')
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: adminPassword, type: 'admin' }),
    })

    if (res.ok) {
      setAuthed(true)
    } else {
      setAuthError('Invalid admin password')
    }
  }

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

  useEffect(() => {
    if (authed) loadPrompt()
  }, [authed])

  useEffect(() => {
    async function checkAdmin() {
      try {
        const res = await fetch('/api/admin-status')
        const data = await res.json()
        if (data.isAdmin === true) setAuthed(true)
      } catch {
        setAuthed(false)
      } finally {
        setCheckingAuth(false)
      }
    }

    checkAdmin()
  }, [])

  if (checkingAuth) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)', color: 'var(--text-muted)', fontSize: '12px'
      }}>
        Checking admin access...
      </div>
    )
  }

  if (!authed) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)'
      }}>
        <div style={{ width: '360px' }}>
          <button onClick={() => router.push('/tool')} style={{
            background: 'none', border: 'none', color: 'var(--text-muted)', marginBottom: '24px',
            padding: 0, cursor: 'pointer', fontSize: '12px'
          }}>Back to tool</button>
          <SmallLabel>Admin only</SmallLabel>
          <h1 style={{ fontSize: '18px', fontWeight: '600', margin: '8px 0' }}>Tool Logic Guide</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '24px' }}>
            Enter the admin password to view prompt logic, decision patterns, and optimization notes.
          </p>
          <form onSubmit={handleAdminLogin}>
            <input
              type="password"
              placeholder="Admin password"
              value={adminPassword}
              onChange={e => setAdminPassword(e.target.value)}
              autoFocus
              style={{ width: '100%', padding: '10px 14px', marginBottom: '12px' }}
            />
            {authError && <p style={{ color: 'var(--danger)', fontSize: '12px', marginBottom: '10px' }}>{authError}</p>}
            <button type="submit" disabled={!adminPassword} style={{
              width: '100%', padding: '10px', background: 'var(--accent)', border: 'none',
              color: '#000', fontWeight: '600', cursor: adminPassword ? 'pointer' : 'not-allowed',
              borderRadius: '4px', opacity: adminPassword ? 1 : 0.7
            }}>Enter</button>
          </form>
        </div>
      </div>
    )
  }

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
                  CSV/XLSX exports with Keyword and Volume columns. All valid workbook sheets are parsed. Optional KD, CPC, competition, intent, trend, SERP, page, topic, and page type columns are used when present.
                </p>
              </div>
              <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '4px', padding: '12px' }}>
                <SmallLabel>Paste rows</SmallLabel>
                <p style={{ margin: '6px 0 0', color: 'var(--text-dim)' }}>
                  Paste rows as keyword, volume, KD. Spreadsheet-style tab-separated rows are supported, including volumes like 12,100.
                </p>
              </div>
            </div>
            <div style={{ marginTop: '12px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '4px', padding: '12px' }}>
              <SmallLabel>Source roles</SmallLabel>
              <p style={{ margin: '6px 0 0', color: 'var(--text-dim)' }}>
                Each upload/paste section has a role: Broad Match Keywords, Current Page / Competitor Gap,
                Page Cluster / Page Opportunities, Custom Keyword List, or Auto-detect.
                Auto-detect uses headers like Page/Topic/Page type for page clusters, competitor domain columns plus KD% for gap data,
                and Intent/Trend/Keyword Difficulty/SERP Features for broad-match exports.
              </p>
            </div>
          </Card>

          <Card title="Pre-Filter Logic">
            <ol style={{ margin: 0, paddingLeft: '18px', color: 'var(--text-dim)' }}>
              <li>Parse all valid CSV/XLSX sheets and pasted rows under their section labels and source roles.</li>
              <li>Normalize column aliases: KD/KD%/Keyword Difficulty/Difficulty, Volume/Search Volume/Avg. Monthly Searches, and Com./Competitive Density.</li>
              <li>Remove ordinary keywords with volume below 30. Tight access/trust modifiers below 30 are retained only as non-target wording guidance when their stripped base exactly matches a measured current-page term.</li>
              <li>Deduplicate by normalized keyword and keep the highest-volume version.</li>
              <li>Assign stable keyword_id values after filtering and sorting.</li>
              <li>Select up to 500 rows with volume-first source-role coverage plus question, access, trust, comparison, and specific multi-word phrase protection.</li>
              <li>Parse Seed keyword as a non-metric discovery signal. It can strengthen a corroborated future cluster or become a Missing Export request, never a keyword target.</li>
            </ol>
          </Card>

          <Card title="LLM Data Flow">
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
              gap: '10px',
            }}>
              {['Form inputs + source roles', 'Merged keyword list + IDs', 'Stage 1: ID classification', 'Stage 2: strategy pools', 'Metric audit', 'UI/report'].map((step, i) => (
                <div key={step} style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
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

          <Card title="Persistent Brand Strategy Scope">
            <p style={{ color: 'var(--text-dim)', margin: 0 }}>
              This is an Admin-managed setting used only for future page opportunities and article ideation. Change it when the broader brand goal changes; it never broadens current-page keyword selection.
            </p>
            {promptData?.brandScope && (
              <pre style={{ margin: '12px 0 0', whiteSpace: 'pre-wrap', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '4px', padding: '10px', color: 'var(--text-muted)', fontSize: '11px' }}>{promptData.brandScope}</pre>
            )}
          </Card>

          <Card title="Two-Stage Pool Logic">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px' }}>
              {[
                ['Current Page IDs', 'Only these rows can become Primary, Supporting, or Longtail. Keyword text must match the submitted page job.'],
                ['New Page IDs', 'Different user jobs that fit Brand Strategy Scope. They can become future Product, Tool, Blog, GEO, Docs, or workflow opportunities.'],
                ['Out-of-Brand IDs', 'Terms that fit neither the submitted page nor the brand scope. They do not enter recommendations.'],
              ].map(([label, text]) => (
                <div key={label} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '4px', padding: '12px' }}>
                  <SmallLabel>{label}</SmallLabel>
                  <p style={{ margin: '6px 0 0', color: 'var(--text-dim)' }}>{text}</p>
                </div>
              ))}
            </div>
            <p style={{ margin: '12px 0 0', color: 'var(--text-muted)', fontSize: '11px' }}>
              A row can belong to both Current Page and New Page pools only when both uses are genuinely valid. Source roles describe where the data came from; pools decide where the keyword may be recommended.
            </p>
          </Card>

          <Card title="Global Ranking Logic">
            <p style={{ color: 'var(--text-dim)', margin: '0 0 12px' }}>
              When multiple keywords qualify, the LLM should compare them in this order. Lower KD alone does not win
              if intent, page fit, or volume is weaker.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '8px' }}>
              {globalRankingRules.map((rule, i) => (
                <div key={rule} style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  padding: '10px',
                }}>
                  <SmallLabel>Priority {i + 1}</SmallLabel>
                  <div style={{ marginTop: '4px', color: 'var(--text)' }}>{rule}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Metric Interpretation">
            <ul style={{ margin: 0, paddingLeft: '18px', color: 'var(--text-dim)' }}>
              {metricRules.map(rule => <li key={rule}>{rule}</li>)}
            </ul>
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
                  <SmallLabel>How it judges</SmallLabel>
                  <ul style={{ margin: '6px 0 10px', paddingLeft: '18px', color: 'var(--text-muted)', fontSize: '11px' }}>
                    {item.criteria.map(rule => <li key={rule}>{rule}</li>)}
                  </ul>
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
              <li>Use Brand Strategy Scope to decide which broader future themes are in scope. It applies only to New Page Opportunities and Article Idea Expansions.</li>
              <li>Below-30 access/trust wording is not a target keyword. It appears only when it is a tight modifier of a measured current-page term.</li>
              <li>Seed phrases are discovery signals only. Without measured corroboration, they should appear as Missing Export guidance rather than ranked keywords.</li>
              <li>If metrics look wrong, inspect source roles and keyword_id matching first. The API now removes metrics from AI suggestions that do not match parsed raw data.</li>
              <li>If a file type is classified incorrectly, change the section role manually before running the analysis.</li>
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
