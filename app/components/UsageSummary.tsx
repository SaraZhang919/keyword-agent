'use client'

import type { GenerationUsage } from '@/lib/generationUsage'

const tokens = (value: number | null) => value === null ? 'Unknown' : value.toLocaleString('en-US')
const dollars = (value: number | null) => value === null ? 'Unknown' : `$${value.toFixed(6)}`

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
  return <section aria-label="Token usage and estimated cost" style={{ padding: 20, marginBottom: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
      <strong>Token usage &amp; estimated cost</strong>
      <button type="button" onClick={download} style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', padding: '6px 10px' }}>Download usage JSON</button>
    </div>
    <p style={{ color: 'var(--text-dim)', fontSize: 12 }}>{usage.model} · {usage.reasoningEffort} reasoning · {usage.status === 'failed' ? 'Failed analysis' : 'Completed analysis'}</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, margin: '16px 0' }}>
      <span>Input <strong>{tokens(usage.totals.inputTokens)}</strong></span>
      <span>Output <strong>{tokens(usage.totals.outputTokens)}</strong></span>
      <span>Total <strong>{tokens(usage.totals.totalTokens)}</strong></span>
      <span>Estimated cost <strong style={{ color: 'var(--accent)' }}>{dollars(usage.totals.estimatedCostUsd)}</strong></span>
    </div>
    {!usage.totals.complete && <p style={{ color: 'var(--warn)' }}>Some usage or pricing is unavailable. Known cost subtotal: {dollars(usage.totals.knownCostUsd)}; this is not the full run cost.</p>}
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <caption style={{ textAlign: 'left', color: 'var(--text-muted)', marginBottom: 8 }}>API usage by stage</caption>
        <thead><tr>{['Stage', 'Input', 'Cached input', 'Cache writes', 'Output', 'Reasoning', 'Total', 'Est. USD'].map(label => <th key={label} scope="col" style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{label}</th>)}</tr></thead>
        <tbody>{usage.stages.map(stage => <tr key={stage.stage}>
          {[stage.stage === 'classification' ? 'Classification' : 'Strategy', tokens(stage.inputTokens), tokens(stage.cachedInputTokens), tokens(stage.cacheWriteTokens), tokens(stage.outputTokens), tokens(stage.reasoningTokens), tokens(stage.totalTokens), dollars(stage.estimatedCostUsd)].map((value, index) => <td key={index} style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>{value}</td>)}
        </tr>)}</tbody>
      </table>
    </div>
    <details style={{ marginTop: 12, fontSize: 12 }}>
      <summary>Calculation and rates</summary>
      <p>Cost = (uncached input × input rate + cached input × cache-read rate + cache writes × cache-write rate + output × output rate) / 1,000,000.</p>
      <p>Uncached input = input − cached input − cache writes.</p>
      {usage.stages.filter(stage => stage.ratesPerMillion).map(stage => <p key={stage.stage}>{stage.stage === 'classification' ? 'Classification' : 'Strategy'} · {stage.model} · USD per 1M tokens: input ${stage.ratesPerMillion!.input}, cache reads ${stage.ratesPerMillion!.cachedInput}, cache writes ${stage.ratesPerMillion!.cacheWrite}, output ${stage.ratesPerMillion!.output}.</p>)}
    </details>
    {usage.stages.filter(stage => stage.note).map(stage => <p key={stage.stage} style={{ color: 'var(--warn)', fontSize: 12 }}>{stage.stage}: {stage.note}</p>)}
    <p style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 0 }}>Cached input and cache writes are included in input. Reasoning is included in output. Cost uses <a href={usage.pricing.source} target="_blank" rel="noreferrer">published standard USD rates</a> dated {usage.pricing.version}; it is an estimate, not your invoice. Run ID: {usage.runId}</p>
  </section>
}
