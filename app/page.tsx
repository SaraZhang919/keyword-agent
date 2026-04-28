'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, type: 'tool' }),
    })
    setLoading(false)
    if (res.ok) { router.push('/tool') }
    else { setError('Invalid password') }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: '24px'
    }}>
      {/* Grid background */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0,
        backgroundImage: 'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)',
        backgroundSize: '40px 40px', opacity: 0.3
      }} />

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: '360px' }}>
        {/* Header */}
        <div style={{ marginBottom: '40px', textAlign: 'center' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            background: 'var(--accent-dim)', border: '1px solid var(--accent)',
            borderRadius: '4px', padding: '4px 12px', marginBottom: '20px'
          }}>
            <span style={{ color: 'var(--accent)', fontSize: '11px', letterSpacing: '0.1em' }}>INTERNAL TOOL</span>
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: '600', color: 'var(--text)', margin: '0 0 8px' }}>
            Keyword Strategy Agent
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: 0 }}>
            Enter team password to access
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '16px' }}>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoFocus
              style={{
                width: '100%', padding: '12px 16px',
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: '4px', color: 'var(--text)', fontSize: '14px'
              }}
            />
          </div>

          {error && (
            <p style={{ color: 'var(--danger)', fontSize: '12px', marginBottom: '12px', textAlign: 'center' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            style={{
              width: '100%', padding: '12px',
              background: loading || !password ? 'var(--surface-2)' : 'var(--accent)',
              border: 'none', borderRadius: '4px',
              color: loading || !password ? 'var(--text-muted)' : '#000',
              fontWeight: '600', fontSize: '13px', letterSpacing: '0.05em',
              cursor: loading || !password ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Verifying...' : 'Enter →'}
          </button>
        </form>
      </div>
    </div>
  )
}
