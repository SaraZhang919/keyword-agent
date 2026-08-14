export type ConversionDirection = {
  from: string
  to: string
}

const FORMAT_ALIASES: Record<string, string> = {
  markdown: 'markdown',
  md: 'markdown',
  pdf: 'pdf',
  word: 'word',
  doc: 'word',
  docx: 'word',
  excel: 'excel',
  xls: 'excel',
  xlsx: 'excel',
  powerpoint: 'powerpoint',
  ppt: 'powerpoint',
  pptx: 'powerpoint',
  csv: 'csv',
  json: 'json',
  xml: 'xml',
  html: 'html',
  text: 'text',
  txt: 'text',
  epub: 'epub',
  mobi: 'mobi',
  image: 'image',
  images: 'image',
  jpg: 'jpg',
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  svg: 'svg',
  heic: 'heic',
  audio: 'audio',
  mp3: 'mp3',
  video: 'video',
  mp4: 'mp4',
}

const DIRECTION_CONNECTORS = new Set(['to', 'into', '2', 'a'])

function tokens(value: string): string[] {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter(Boolean)
}

export function parseConversionDirection(value: string): ConversionDirection | null {
  const parts = tokens(value)
  for (let connectorIndex = 1; connectorIndex < parts.length - 1; connectorIndex += 1) {
    if (!DIRECTION_CONNECTORS.has(parts[connectorIndex])) continue

    let from: string | undefined
    for (let i = connectorIndex - 1; i >= 0; i -= 1) {
      from = FORMAT_ALIASES[parts[i]]
      if (from) break
    }

    let to: string | undefined
    for (let i = connectorIndex + 1; i < parts.length; i += 1) {
      to = FORMAT_ALIASES[parts[i]]
      if (to) break
    }

    if (from && to && from !== to) return { from, to }
  }
  return null
}

export function hasOppositeConversionDirection(candidate: string, submitted: string): boolean {
  const candidateDirection = parseConversionDirection(candidate)
  const submittedDirection = parseConversionDirection(submitted)
  return Boolean(
    candidateDirection &&
    submittedDirection &&
    candidateDirection.from === submittedDirection.to &&
    candidateDirection.to === submittedDirection.from
  )
}

