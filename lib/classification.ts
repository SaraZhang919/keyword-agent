export type KeywordClassification = {
  current_page_ids: string[]
  new_page_ids: string[]
  out_of_brand_ids: string[]
}

const POOLS = ['current_page_ids', 'new_page_ids', 'out_of_brand_ids'] as const

// Allow every admitted ID in one pool, plus current/future-page overlap and
// JSON whitespace. Raising the ceiling does not force the model to use it.
export function classificationTokenBudget(rowCount: number): number {
  return Math.min(32768, Math.max(5000, 1024 + rowCount * 20))
}

export const classificationResponseFormat = {
  type: 'json_schema',
  json_schema: {
    name: 'keyword_classification',
    strict: true,
    schema: {
      type: 'object',
      properties: Object.fromEntries(POOLS.map(key => [key, {
        type: 'array', items: { type: 'string' },
      }])),
      required: [...POOLS],
      additionalProperties: false,
    },
  },
}

type FailureCode = 'classification_truncated' | 'classification_refused' |
  'classification_incomplete' | 'classification_invalid_json' |
  'classification_invalid_schema' | 'classification_unknown_ids' |
  'classification_missing_ids' | 'classification_conflicting_ids'

type ClassificationResult = { ok: true; classification: KeywordClassification } |
  { ok: false; code: FailureCode; error: string; invalidIdCount?: number; missingIdCount?: number }

// Check completion before parsing: even parseable JSON may be incomplete.
export function readClassification(envelope: any, availableIds: Set<string>): ClassificationResult {
  const choice = envelope?.choices?.[0]
  if (choice?.finish_reason === 'length') return {
    ok: false, code: 'classification_truncated',
    error: 'Keyword classification reached its output limit. Try fewer keywords. No strategy was generated.',
  }
  if (choice?.message?.refusal) return {
    ok: false, code: 'classification_refused',
    error: 'The AI declined the keyword classification request. Review the submitted input before trying again.',
  }
  if (choice?.finish_reason !== 'stop') return {
    ok: false, code: 'classification_incomplete',
    error: 'Keyword classification did not finish normally. No strategy was generated. Please try again.',
  }
  let data: unknown
  try { data = JSON.parse(choice.message.content) } catch {
    return { ok: false, code: 'classification_invalid_json', error: 'Keyword classification returned malformed JSON. No strategy was generated. Please try again.' }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return invalidSchema()
  const pools = data as Record<string, unknown>
  if (Object.keys(pools).length !== POOLS.length || POOLS.some(key =>
    !Array.isArray(pools[key]) || (pools[key] as unknown[]).some(id => typeof id !== 'string')
  )) return invalidSchema()
  const classification = Object.fromEntries(POOLS.map(key => [key, [...new Set(pools[key] as string[])]])) as KeywordClassification
  const classified = new Set(POOLS.flatMap(key => classification[key]))
  const invalidIdCount = [...classified].filter(id => !availableIds.has(id)).length
  if (invalidIdCount) return {
    ok: false, code: 'classification_unknown_ids', invalidIdCount,
    error: 'Keyword classification returned IDs outside the uploaded keyword set. No strategy was generated. Please try again.',
  }
  const missingIdCount = [...availableIds].filter(id => !classified.has(id)).length
  if (missingIdCount) return {
    ok: false, code: 'classification_missing_ids', missingIdCount,
    error: `Keyword classification omitted ${missingIdCount} uploaded keyword IDs. No strategy was generated. Please try again.`,
  }
  const inScope = new Set([...classification.current_page_ids, ...classification.new_page_ids])
  if (classification.out_of_brand_ids.some(id => inScope.has(id))) return {
    ok: false, code: 'classification_conflicting_ids',
    error: 'Keyword classification returned conflicting in-scope and out-of-brand decisions. No strategy was generated. Please try again.',
  }
  return { ok: true, classification }
}

function invalidSchema(): ClassificationResult {
  return { ok: false, code: 'classification_invalid_schema', error: 'Keyword classification returned an unexpected structure. No strategy was generated. Please try again.' }
}
