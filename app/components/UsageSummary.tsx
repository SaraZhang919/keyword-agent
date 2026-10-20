'use client'

import type { GenerationUsage } from '@/lib/generationUsage'

const tokens = (value: number | null) => value === null ? 'Unknown' : value.toLocaleString('en-US')

export default function UsageSummary({ usage }: { usage: GenerationUsage }) {
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(usage, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `keyword-usage-${usage.runId}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <section aria-label="Token usage" style={{ padding: 20, marginTop: 24, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
      <strong>Token usage</strong>
      <button type="button" onClick={download} style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', padding: '6px 10px' }}>Download usage JSON</button>
    </div>
    <p style={{ color: 'var(--text-dim)', fontSize: 12 }}>{usage.model} · {usage.reasoningEffort} reasoning · {usage.status === 'failed' ? 'Failed analysis' : 'Completed analysis'}</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, margin: '16px 0' }}>
      <span>Input <strong>{tokens(usage.totals.inputTokens)}</strong></span>
      <span>Output <strong>{tokens(usage.totals.outputTokens)}</strong></span>
      <span>Total <strong>{tokens(usage.totals.totalTokens)}</strong></span>
    </div>
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <caption style={{ textAlign: 'left', color: 'var(--text-muted)', marginBottom: 8 }}>API usage by stage</caption>
        <thead><tr>{['Stage', 'Input', 'Cached input', 'Cache writes', 'Output', 'Reasoning', 'Total'].map(label => <th key={label} scope="col" style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{label}</th>)}</tr></thead>
        <tbody>{usage.stages.map(stage => <tr key={stage.stage}>
          {[stage.stage === 'classification' ? 'Classification' : 'Strategy', tokens(stage.inputTokens), tokens(stage.cachedInputTokens), tokens(stage.cacheWriteTokens), tokens(stage.outputTokens), tokens(stage.reasoningTokens), tokens(stage.totalTokens)].map((value, index) => <td key={index} style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>{value}</td>)}
        </tr>)}</tbody>
      </table>
    </div>
    {usage.stages.filter(stage => stage.note).map(stage => <p key={stage.stage} style={{ color: 'var(--warn)', fontSize: 12 }}>{stage.stage}: {stage.note}</p>)}
    <p style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 0 }}>Cached input and cache writes are included in input. Reasoning is included in output. Run ID: {usage.runId}</p>
  </section>
}
