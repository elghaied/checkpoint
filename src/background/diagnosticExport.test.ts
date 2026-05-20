import { describe, it, expect, beforeEach } from 'vitest'
import '../__mocks__/chrome'
import { resetChromeStorage } from '../__mocks__/chrome'

import { buildDiagnosticReport, redactEntry, __resetSaltForTests } from './diagnosticExport'
import type { DiagnosticEntry } from '@/shared/types'

beforeEach(() => {
  resetChromeStorage()
  __resetSaltForTests()
})

describe('redactEntry', () => {
  it('strips URLs to host only', async () => {
    const e: DiagnosticEntry = {
      ts: 1,
      level: 'info',
      tag: 'test',
      ctx: 'sw',
      msg: 'fetch https://mangadex.org/title/abc/chapter/1 ok',
    }
    const out = await redactEntry(e)
    expect(out.msg).toContain('mangadex.org')
    expect(out.msg).not.toContain('/title/abc/chapter/1')
  })

  it('hashes data.title to a stable t#... token', async () => {
    const e: DiagnosticEntry = {
      ts: 1,
      level: 'info',
      tag: 'test',
      ctx: 'sw',
      msg: 'add',
      data: { title: 'Solo Leveling', providerId: '12345' },
    }
    const a = await redactEntry(e)
    const b = await redactEntry(e)
    const data = a.data as { title: string; providerId: string }
    expect(data.title).toMatch(/^t#[0-9a-f]{8}$/)
    expect(data.providerId).toBe('12345')
    expect((b.data as { title: string }).title).toBe(data.title) // stable
  })

  it('redacts recursively across known sensitive key names', async () => {
    const e: DiagnosticEntry = {
      ts: 1,
      level: 'info',
      tag: 'test',
      ctx: 'sw',
      msg: 'x',
      data: {
        url: 'https://example.com/x/y',
        nested: { query: 'foo', name: 'bar', other: 'unchanged' },
      },
    }
    const out = await redactEntry(e)
    const data = out.data as {
      url: string
      nested: { query: string; name: string; other: string }
    }
    expect(data.url).toBe('example.com')
    expect(data.nested.query).toMatch(/^t#[0-9a-f]{8}$/)
    expect(data.nested.name).toMatch(/^t#[0-9a-f]{8}$/)
    expect(data.nested.other).toBe('unchanged')
  })
})

describe('buildDiagnosticReport', () => {
  it('returns a report with the expected shape', async () => {
    const report = await buildDiagnosticReport()
    expect(report.schemaVersion).toBe(1)
    expect(report.extensionVersion).toBe('0.0.0-test')
    expect(report.browser.ua).toBe(navigator.userAgent)
    expect(report.storageSummary).toMatchObject({
      itemCount: expect.any(Number),
      customListsCount: expect.any(Number),
      customTagsCount: expect.any(Number),
      storageBytesInUse: expect.any(Number),
    })
    expect(Array.isArray(report.log)).toBe(true)
  })

  it('includes lastSaveAttempt if present', async () => {
    await new Promise<void>((resolve) =>
      chrome.storage.local.set(
        {
          lastSaveAttempt: { providerId: 'pp', provider: 'anilist', ok: false, ts: 999 },
        },
        () => resolve()
      )
    )
    const report = await buildDiagnosticReport()
    expect(report.storageSummary.lastSaveAttempt).toEqual({
      providerId: 'pp',
      provider: 'anilist',
      ok: false,
      ts: 999,
    })
  })
})
