import { useMemo, useState } from 'react'
import type { DiagnosticReport } from '@/shared/types'
import { clearDiagnosticLog } from '../services/messaging'
import './DiagnosticPreviewModal.css'

interface Props {
  report: DiagnosticReport
  onClose: () => void
  onCleared: () => void
}

export function DiagnosticPreviewModal({ report, onClose, onCleared }: Props) {
  const [copied, setCopied] = useState(false)
  const [confirmingClear, setConfirmingClear] = useState(false)

  const json = useMemo(() => JSON.stringify(report, null, 2), [report])
  const preview = useMemo(() => {
    const truncated: DiagnosticReport = {
      ...report,
      log: report.log.slice(-50),
    }
    return JSON.stringify(truncated, null, 2)
  }, [report])

  const counts = useMemo(() => {
    let warn = 0
    let error = 0
    for (const e of report.log) {
      if (e.level === 'warn') warn++
      else if (e.level === 'error') error++
    }
    return { warn, error }
  }, [report.log])

  const spanDays = useMemo(() => {
    if (report.log.length === 0) return 0
    const first = report.log[0].ts
    const last = report.log[report.log.length - 1].ts
    return Math.max(1, Math.round((last - first) / 86400000))
  }, [report.log])

  const handleDownload = () => {
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `checkpoint-diagnostic-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(json)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleClear = async () => {
    if (!confirmingClear) {
      setConfirmingClear(true)
      return
    }
    await clearDiagnosticLog()
    onCleared()
  }

  return (
    <div className="diag-modal__overlay" onClick={onClose}>
      <div className="diag-modal" onClick={(e) => e.stopPropagation()}>
        <div className="diag-modal__header">
          <strong>Diagnostic report preview</strong>
          <button className="diag-modal__btn" onClick={onClose}>Close</button>
        </div>
        <div className="diag-modal__summary">
          <span>{report.log.length} entries</span>
          <span>spanning ~{spanDays} day{spanDays === 1 ? '' : 's'}</span>
          <span>{counts.warn} warnings · {counts.error} errors</span>
          <span className="diag-modal__pill">Redaction: on</span>
        </div>
        <pre className="diag-modal__preview" aria-label="Bundle preview">
          {preview}
          {report.log.length > 50 ? `\n\n... ${report.log.length - 50} earlier entries omitted from preview ...` : ''}
        </pre>
        <div className="diag-modal__actions">
          <button className="diag-modal__btn--danger diag-modal__btn" onClick={handleClear}>
            {confirmingClear ? 'Confirm clear' : 'Clear log'}
          </button>
          <div style={{ flex: 1 }} />
          <button className="diag-modal__btn" onClick={handleCopy}>
            {copied ? 'Copied' : 'Copy to clipboard'}
          </button>
          <button className="diag-modal__btn--primary diag-modal__btn" onClick={handleDownload}>
            Download .json
          </button>
        </div>
      </div>
    </div>
  )
}
