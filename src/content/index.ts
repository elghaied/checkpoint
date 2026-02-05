// Checkpoint Content Script
console.log('Checkpoint content script loaded')

// Message listener
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('Content script received message:', message)

  if (message.type === 'EXTRACT_METADATA') {
    const metadata = extractPageMetadata()
    console.log('[Checkpoint] Extracted metadata:', metadata)
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

function extractFromOgTitle(): string | null {
  const meta = document.querySelector('meta[property="og:title"]')
  return meta?.getAttribute('content') || null
}

function extractFromH1(): string | null {
  const h1 = document.querySelector('h1')
  return h1?.textContent?.trim() || null
}

function cleanTitle(raw: string): string | null {
  if (!raw) return null

  let title = raw

  // Remove chapter/episode indicators (with or without separators)
  const chapterPatterns = [
    /\s*[-|:]\s*Chapter\s*\d+.*$/i,      // - Chapter 95, | Chapter 95
    /\s*[-|:]\s*Ch\.?\s*\d+.*$/i,        // - Ch. 95, | Ch 95
    /\s+Chapter\s*\d+.*$/i,               // Chapter 95 (space before)
    /\s+Ch\.?\s*\d+.*$/i,                 // Ch. 95, Ch 95
    /\s+Episode\s*\d+.*$/i,               // Episode 10
    /\s+Ep\.?\s*\d+.*$/i,                 // Ep. 10, Ep 10
    /\s*#\d+.*$/i,                         // #95
  ]

  for (const pattern of chapterPatterns) {
    title = title.replace(pattern, '')
  }

  // Remove common site suffixes
  const sitePatterns = [
    /\s*[-|]\s*(?:MangaDex|Webtoon|Tapas|MangaPlus|Asura|Reaper|Flame|Luminous|Read Online|Manga|Comics?).*$/i,
    /\s*[-|]\s*Read\s+(?:Online|Free|Now).*$/i,
  ]

  for (const pattern of sitePatterns) {
    title = title.replace(pattern, '')
  }

  return title.trim() || null
}

function extractChapter(text: string): string | null {
  const patterns = [
    /chapter\s*(\d+(?:\.\d+)?)/i,
    /ch\.?\s*(\d+(?:\.\d+)?)/i,
    /ep(?:isode)?\.?\s*(\d+(?:\.\d+)?)/i,
    /#(\d+(?:\.\d+)?)/,
    /\/(?:chapter|ch|c)-?(\d+(?:\.\d+)?)/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      return match[1]
    }
  }

  return null
}
