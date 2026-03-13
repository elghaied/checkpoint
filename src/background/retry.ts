interface RetryOptions {
  maxRetries?: number // default: 2 (3 total attempts)
  baseDelayMs?: number // default: 500
  retryableStatuses?: number[] // default: [429, 500, 502, 503, 504]
}

export async function fetchWithRetry(
  input: RequestInfo,
  init?: RequestInit,
  options?: RetryOptions
): Promise<Response> {
  const { maxRetries = 2, baseDelayMs = 500, retryableStatuses = [429, 500, 502, 503, 504] } = options ?? {}

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(input, init)

      if (response.ok || !retryableStatuses.includes(response.status)) {
        return response
      }

      // Retryable HTTP error
      if (attempt < maxRetries) {
        let delay = baseDelayMs * Math.pow(2, attempt)

        // Respect Retry-After header on 429 responses
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After')
          if (retryAfter) {
            const seconds = parseInt(retryAfter, 10)
            if (!isNaN(seconds)) {
              delay = Math.max(delay, seconds * 1000)
            }
          }
        }

        console.warn(`[retry] Attempt ${attempt + 1} failed (HTTP ${response.status}), retrying in ${delay}ms`)
        await new Promise((resolve) => setTimeout(resolve, delay))
        continue
      }

      return response // Return the last failed response
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt)
        console.warn(`[retry] Attempt ${attempt + 1} failed (network error), retrying in ${delay}ms`)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }

  throw lastError ?? new Error('Fetch failed after retries')
}
