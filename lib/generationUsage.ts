import { randomUUID } from 'node:crypto'

export type TokenCounts = {
  inputTokens: number | null
  cachedInputTokens: number | null
  cacheWriteTokens: number | null
  outputTokens: number | null
  reasoningTokens: number | null
  totalTokens: number | null
}

export type UsageStage = TokenCounts & {
  stage: 'classification' | 'strategy'
  model: string
  responseId: string | null
  httpStatus: number | null
  finishReason: string | null
  durationMs: number
  estimatedCostUsd: number | null
  ratesPerMillion: { input: number; cachedInput: number; cacheWrite: number; output: number } | null
  note: string | null
}

export type GenerationUsage = {
  runId: string
  model: string
  reasoningEffort: string
  recordedAt: string
  status: 'completed' | 'failed'
  pricing: { version: string; source: string; currency: 'USD'; scope: string }
  stages: UsageStage[]
  totals: TokenCounts & { estimatedCostUsd: number | null; knownCostUsd: number; complete: boolean }
}

const PRICING = {
  version: '2026-10-20', source: 'https://developers.openai.com/api/docs/models/gpt-5.6-terra', currency: 'USD' as const,
  scope: 'OpenAI direct, standard processing. Estimate excludes taxes, credits and account-specific adjustments.',
}
const count = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
const unknownCounts = (): TokenCounts => ({ inputTokens: null, cachedInputTokens: null, cacheWriteTokens: null, outputTokens: null, reasoningTokens: null, totalTokens: null })

export function measureUsage(envelope: any, requestedModel: string): Omit<UsageStage, 'stage' | 'httpStatus' | 'durationMs'> {
  const model = typeof envelope?.model === 'string' ? envelope.model : requestedModel
  const raw = envelope?.usage
  const inputTokens = count(raw?.prompt_tokens), outputTokens = count(raw?.completion_tokens)
  const cachedInputTokens = count(raw?.prompt_tokens_details?.cached_tokens)
  const cacheWriteTokens = count(raw?.prompt_tokens_details?.cache_write_tokens)
  const reasoningTokens = count(raw?.completion_tokens_details?.reasoning_tokens)
  const reportedTotal = count(raw?.total_tokens)
  const totalTokens = inputTokens !== null && outputTokens !== null &&
    (reportedTotal === null || reportedTotal === inputTokens + outputTokens) ? inputTokens + outputTokens : null
  let ratesPerMillion: UsageStage['ratesPerMillion'] = null
  let estimatedCostUsd: number | null = null
  let note: string | null = null
  const knownModel = model === 'gpt-5.6-terra' || model.startsWith('gpt-5.6-terra-')
  if (!knownModel) note = 'No pricing configured for the returned model.'
  else if (inputTokens === null || outputTokens === null || totalTokens === null) note = 'Provider token usage is missing or inconsistent; cost is unknown.'
  else if (cachedInputTokens === null || cacheWriteTokens === null) note = 'Provider cache breakdown is missing; cost is unknown.'
  else if (cachedInputTokens + cacheWriteTokens > inputTokens || (reasoningTokens !== null && reasoningTokens > outputTokens)) note = 'Provider token breakdown is inconsistent; cost is unknown.'
  else {
    const longContext = inputTokens > 272000
    ratesPerMillion = longContext ? { input: 4, cachedInput: 0.4, cacheWrite: 5, output: 18 } : { input: 2, cachedInput: 0.2, cacheWrite: 2.5, output: 12 }
    const ordinaryInput = inputTokens - cachedInputTokens - cacheWriteTokens
    estimatedCostUsd = (ordinaryInput * ratesPerMillion.input + cachedInputTokens * ratesPerMillion.cachedInput +
      cacheWriteTokens * ratesPerMillion.cacheWrite + outputTokens * ratesPerMillion.output) / 1_000_000
  }
  return {
    model, responseId: typeof envelope?.id === 'string' ? envelope.id : null,
    finishReason: envelope?.choices?.[0]?.finish_reason ?? null,
    inputTokens, cachedInputTokens, cacheWriteTokens, outputTokens, reasoningTokens, totalTokens,
    estimatedCostUsd, ratesPerMillion, note,
  }
}

export function createGenerationUsage(model: string, reasoningEffort: string) {
  const runId = randomUUID(), stages: UsageStage[] = []
  async function capture(stage: UsageStage['stage'], providerCall: () => Promise<Response>) {
    const entry: UsageStage = {
      stage, model, responseId: null, httpStatus: null, finishReason: null, durationMs: 0,
      ...unknownCounts(), estimatedCostUsd: null, ratesPerMillion: null, note: 'Provider usage is unavailable; cost is unknown.',
    }
    stages.push(entry)
    const started = Date.now()
    try {
      const response = await providerCall()
      entry.httpStatus = response.status
      // Read a clone before result validation so failed/truncated generations
      // retain their usage, and the route can still consume the response body.
      try { Object.assign(entry, measureUsage(await response.clone().json(), model)) } catch { /* Keep unknown, never zero. */ }
      return response
    } finally { entry.durationMs = Date.now() - started }
  }
  function report(status: GenerationUsage['status']): GenerationUsage {
    function sum(key: keyof TokenCounts): number | null {
      return stages.some(stage => stage[key] === null) ? null : stages.reduce((total, stage) => total + stage[key]!, 0)
    }
    const knownCostUsd = stages.reduce((total, stage) => total + (stage.estimatedCostUsd ?? 0), 0)
    const complete = stages.every(stage => stage.estimatedCostUsd !== null)
    return {
      runId, model, reasoningEffort, recordedAt: new Date().toISOString(), status,
      pricing: { ...PRICING }, stages: stages.map(stage => ({ ...stage })),
      totals: {
        inputTokens: sum('inputTokens'), cachedInputTokens: sum('cachedInputTokens'), cacheWriteTokens: sum('cacheWriteTokens'),
        outputTokens: sum('outputTokens'), reasoningTokens: sum('reasoningTokens'), totalTokens: sum('totalTokens'),
        estimatedCostUsd: complete ? knownCostUsd : null, knownCostUsd, complete,
      },
    }
  }
  return { capture, report }
}
