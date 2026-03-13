// Checkpoint Content Script
import { cleanTitle, extractChapter, extractFromOgTitle, extractFromH1 } from './metadata'
import { createLogger } from '@/shared/logger'

const log = createLogger('content')

log.debug('Content script loaded')

// Message listener
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  log.debug('Received message:', message.type)

  if (message.type === 'EXTRACT_METADATA') {
    const metadata = extractPageMetadata()
    log.debug('Extracted metadata:', metadata)
    sendResponse(metadata)
  }

  return true
})

interface PageMetadata {
  rawTitle: string
  detectedTitle: string | null
  chapterNumber: string | null
  pageUrl: string
  extractionConfidence: 'high' | 'medium' | 'low'
}

function extractPageMetadata(): PageMetadata {
  const rawTitle = document.title
  const pageUrl = window.location.href

  // Extract from various sources
  const ogTitle = extractFromOgTitle()
  const h1Title = extractFromH1()

  // Use best available title
  const bestTitle = ogTitle || h1Title || rawTitle
  const detectedTitle = cleanTitle(bestTitle)

  // Extract chapter number
  const chapterNumber = extractChapter(rawTitle) || extractChapter(pageUrl)

  // Determine confidence
  let confidence: 'high' | 'medium' | 'low' = 'low'
  if (ogTitle && chapterNumber) {
    confidence = 'high'
  } else if (detectedTitle && chapterNumber) {
    confidence = 'medium'
  }

  return {
    rawTitle,
    detectedTitle,
    chapterNumber,
    pageUrl,
    extractionConfidence: confidence,
  }
}
