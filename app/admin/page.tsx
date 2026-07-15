'use client'
import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function AdminContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const mode = searchParams.get('mode')
  const returnTo = searchParams.get('returnTo') || '/tool'
  const unlockOnly = mode === 'unlock'
  const [adminPassword, setAdminPassword] = useState('')
  const [authed, setAuthed] = useState(false)
  const [authError, setAuthError] = useState('')
  const [prompt, setPrompt] = useState('')
  const [brandScope, setBrandScope] = useState('')
  const [isDefault, setIsDefault] = useState(true)
  const [kvUnavailable, setKvUnavailable] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleAdminLogin(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: adminPassword, type: 'admin' }),
    })
    if (res.ok) {
      if (unlockOnly) {
        router.push(returnTo)
      } else {
        setAuthed(true)
        loadPrompt()
      }
    } else {
      setAuthError('Invalid admin password')
    }
  }

  async function loadPrompt() {
    setLoading(true)
    const res = await fetch('/api/prompt')
    const data = await res.json()
    setPrompt(data.prompt)
    setBrandScope(data.brandScope ?? '')
    setIsDefault(data.isDefault)
    setKvUnavailable(data.kvUnavailable ?? false)
    setLoading(false)
  }

  async function handleSave() {
    setSaving(true)
    setSaveMsg('')
    const res = await fetch('/api/prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, brandScope }),
    })
    setSaving(false)
    if (res.ok) {
      setSaveMsg('✓ Saved successfully')
      setIsDefault(false)
    } else {
      const { error } = await res.json()
      setSaveMsg(`✗ ${error}`)
    }
    setTimeout(() => setSaveMsg(''), 4000)
  }

  async function handleReset() {
    if (!confirm('Reset to default prompt?')) return
    await fetch('/api/prompt', { method: 'DELETE' })
    loadPrompt()
  }

  // Admin login gate
  if (!authed) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)'
      }}>
        <div style={{ width: '320px' }}>
          <button onClick={() => router.push('/tool')} style={{
            background: 'none', border: 'none', color: 'var(--text-muted)', marginBottom: '24px',
            padding: 0, cursor: 'pointer', fontSize: '12px'
          }}>← Back to tool</button>
          <h1 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>Admin Access</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '24px' }}>
            {unlockOnly
              ? 'Enter admin password to unlock Guide and Prompt Editor options on the tool page.'
              : 'Enter admin password to manage prompts'}
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
              color: '#000', fontWeight: '600', cursor: 'pointer', borderRadius: '4px'
            }}>Enter →</button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <header style={{
        borderBottom: '1px solid var(--border)', padding: '0 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '52px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => router.push('/tool')} style={{
            background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '12px'
          }}>← Tool</button>
          <span style={{ color: 'var(--border)' }}>|</span>
          <span style={{ fontWeight: '600', fontSize: '14px' }}>Prompt Manager</span>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {saveMsg && (
            <span style={{
              fontSize: '11px',
              color: saveMsg.startsWith('✓') ? 'var(--accent)' : 'var(--danger)'
            }}>{saveMsg}</span>
          )}
          <button onClick={handleReset} style={{
            background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)',
            padding: '5px 12px', fontSize: '11px'
          }}>Reset to Default</button>
          <button onClick={handleSave} disabled={saving} style={{
            background: 'var(--accent)', border: 'none', color: '#000',
            padding: '6px 16px', fontSize: '12px', fontWeight: '600',
            cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1
          }}>
            {saving ? 'Saving...' : 'Save Prompt'}
          </button>
        </div>
      </header>

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 24px' }}>
        {/* Status banners */}
        {isDefault && (
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '4px', padding: '10px 16px', marginBottom: '20px',
            fontSize: '11px', color: 'var(--text-muted)'
          }}>
            ℹ Currently using the <strong style={{ color: 'var(--text)' }}>default prompt</strong>.
            Edit and save to override it for all team members.
          </div>
        )}

        {kvUnavailable && (
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--warn)',
            borderRadius: '4px', padding: '12px 16px', marginBottom: '20px', fontSize: '11px'
          }}>
            <div style={{ color: 'var(--warn)', fontWeight: '600', marginBottom: '6px' }}>
              ⚠ Vercel KV not configured — prompt changes won&apos;t persist
            </div>
            <div style={{ color: 'var(--text-muted)', lineHeight: '1.6' }}>
              To enable persistent prompt editing:<br />
              1. Go to Vercel Dashboard → Storage → Create KV Database<br />
              2. Connect it to your project — env vars are added automatically<br />
              3. Redeploy. Prompts will then save across sessions.
            </div>
          </div>
        )}

        {/* Prompt editor */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '16px 20px', marginBottom: '16px'
        }}>
          <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: '8px' }}>
            BRAND STRATEGY SCOPE
          </label>
          <textarea
            value={brandScope}
            onChange={e => setBrandScope(e.target.value)}
            style={{ width: '100%', minHeight: '72px', padding: '10px 12px', resize: 'vertical', lineHeight: 1.6 }}
          />
          <p style={{ margin: '8px 0 0', color: 'var(--text-muted)', fontSize: '11px', lineHeight: 1.5 }}>
            Used only for New Page Opportunities and Article Idea Expansions. Update it when the broader brand goal changes.
          </p>
        </div>

        {/* Prompt editor */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden'
        }}>
          <div style={{
            padding: '12px 20px', borderBottom: '1px solid var(--border)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.1em' }}>
              SYSTEM PROMPT
            </span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
              Runtime placeholders: {'{{PAGE_TYPE}}'}, {'{{PRIMARY_KEYWORD}}'}, {'{{TARGET_AUDIENCE}}'}, {'{{BRAND_SCOPE}}'}
            </span>
          </div>
          {loading ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
              Loading...
            </div>
          ) : (
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              style={{
                width: '100%', minHeight: '520px', padding: '20px',
                background: 'var(--surface)', border: 'none', resize: 'vertical',
                color: 'var(--text)', lineHeight: '1.7', fontSize: '12px'
              }}
            />
          )}
        </div>

        {/* Help notes */}
        <div style={{ marginTop: '20px', padding: '16px 20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: '10px' }}>TIPS</div>
          <ul style={{ margin: 0, padding: '0 0 0 16px', color: 'var(--text-muted)', fontSize: '11px', lineHeight: '2' }}>
            <li>The prompt is injected as the <strong style={{ color: 'var(--text)' }}>system message</strong> for each generation</li>
            <li>{'{{PAGE_TYPE}}'}, {'{{PRIMARY_KEYWORD}}'}, {'{{TARGET_AUDIENCE}}'}, and {'{{BRAND_SCOPE}}'} are replaced at runtime</li>
            <li>Keep the Current-Page Boundary, Strategy Pool Boundaries, and Page Opportunity Routing rules intact; they separate current-page keywords from broader brand opportunities.</li>
            <li>Brand Strategy Scope affects only New Page Opportunities and Article Idea Expansions. Change it when the brand goal changes.</li>
            <li>Always end the prompt requesting <strong style={{ color: 'var(--text)' }}>pure JSON output</strong> — no markdown fences</li>
            <li>Keep the JSON schema instruction intact — removing it will break result parsing</li>
            <li>Changes apply immediately to all new generations (no redeploy needed)</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export default function AdminPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)', color: 'var(--text-muted)', fontSize: '12px'
      }}>
        Loading admin...
      </div>
    }>
      <AdminContent />
    </Suspense>
  )
}
