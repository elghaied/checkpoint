import { useState, useRef } from 'react'
import { parseCSV, type ParseResult, type ParsedRow } from '../csvParser'
import type { ImportSession, ImportRow } from '@/shared/importTypes'

export interface FileUploadProps {
  existingSession: ImportSession | null
  onSessionCreated: (session: ImportSession) => void
  onDiscardSession: () => void
}

function parsedRowToImportRow(row: ParsedRow, index: number): ImportRow {
  return {
    index,
    csvTitle: row.csvTitle,
    csvChapter: row.csvChapter,
    csvUrl: row.csvUrl,
    csvTags: row.csvTags,
    matchStatus: 'pending',
    matchTier: null,
    bestMatch: null,
    alternatives: [],
    confidenceScore: null,
    duplicateOf: null,
    duplicateConflict: null,
    userSelection: null,
    userSkipped: false,
  }
}

const containerStyle: React.CSSProperties = {
  color: '#e0e0e0',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
}

const sectionStyle: React.CSSProperties = {
  marginBottom: '24px',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '8px',
  fontSize: '14px',
  color: '#a0a0c0',
}

const inputStyle: React.CSSProperties = {
  display: 'block',
  padding: '10px 14px',
  border: '1px dashed #444',
  borderRadius: '6px',
  background: '#12122a',
  color: '#e0e0e0',
  cursor: 'pointer',
  fontSize: '14px',
  width: '100%',
  boxSizing: 'border-box',
}

const errorStyle: React.CSSProperties = {
  color: '#f87171',
  fontSize: '13px',
  marginTop: '8px',
}

const summaryStyle: React.CSSProperties = {
  background: '#12122a',
  border: '1px solid #333',
  borderRadius: '6px',
  padding: '16px',
  marginBottom: '16px',
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: '12px',
}

const summaryItemStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
}

const summaryLabelStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#888',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const summaryValueStyle: React.CSSProperties = {
  fontSize: '20px',
  fontWeight: 700,
  color: '#fff',
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '13px',
  background: '#12122a',
  border: '1px solid #333',
  borderRadius: '6px',
  overflow: 'hidden',
  marginBottom: '16px',
}

const thStyle: React.CSSProperties = {
  padding: '8px 12px',
  textAlign: 'left',
  background: '#1e1e3a',
  color: '#a0a0c0',
  fontWeight: 600,
  borderBottom: '1px solid #333',
}

const tdStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderBottom: '1px solid #252540',
  color: '#d0d0d0',
  maxWidth: '220px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const buttonPrimaryStyle: React.CSSProperties = {
  padding: '10px 20px',
  background: '#6366f1',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  fontWeight: 600,
  fontSize: '14px',
  cursor: 'pointer',
}

const buttonSecondaryStyle: React.CSSProperties = {
  padding: '10px 20px',
  background: 'transparent',
  color: '#a0a0c0',
  border: '1px solid #444',
  borderRadius: '6px',
  fontWeight: 600,
  fontSize: '14px',
  cursor: 'pointer',
  marginLeft: '12px',
}

const resumeBoxStyle: React.CSSProperties = {
  background: '#12122a',
  border: '1px solid #6366f1',
  borderRadius: '6px',
  padding: '16px',
  marginBottom: '24px',
}

const resumeTextStyle: React.CSSProperties = {
  color: '#e0e0e0',
  fontSize: '14px',
  marginBottom: '12px',
}

const selectStyle: React.CSSProperties = {
  padding: '8px 12px',
  background: '#12122a',
  border: '1px solid #444',
  borderRadius: '6px',
  color: '#e0e0e0',
  fontSize: '14px',
  marginRight: '12px',
}

export function FileUpload({ existingSession, onSessionCreated, onDiscardSession }: FileUploadProps) {
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [remapColumn, setRemapColumn] = useState<string>('')
  const [showUpload, setShowUpload] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // If there's an existing session and we haven't chosen to start new, show resume prompt
  if (existingSession && !showUpload) {
    return (
      <div style={containerStyle}>
        <div style={resumeBoxStyle}>
          <p style={resumeTextStyle}>
            You have an active import session ({existingSession.rows.length} titles, phase:{' '}
            <strong>{existingSession.phase}</strong>).
          </p>
          <div>
            <button style={buttonPrimaryStyle} onClick={() => onSessionCreated(existingSession)}>
              Resume
            </button>
            <button style={buttonSecondaryStyle} onClick={() => { onDiscardSession(); setShowUpload(true) }}>
              Discard and Start New
            </button>
          </div>
        </div>
      </div>
    )
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (evt) => {
      const text = evt.target?.result as string
      const result = parseCSV(text)
      setParseResult(result)
      if (result.success === false && result.error === 'missing_title_column') {
        setRemapColumn(result.availableColumns?.[0] ?? '')
      } else {
        setRemapColumn('')
      }
    }
    reader.readAsText(file)
  }

  function handleRemap() {
    const file = fileInputRef.current?.files?.[0]
    if (!file || !remapColumn) return

    const reader = new FileReader()
    reader.onload = (evt) => {
      const text = evt.target?.result as string
      const result = parseCSV(text, { titleColumn: remapColumn })
      setParseResult(result)
    }
    reader.readAsText(file)
  }

  function handleStartMatching() {
    if (!parseResult || !parseResult.success) return

    const rows: ImportRow[] = parseResult.rows.map((row, i) => parsedRowToImportRow(row, i))

    const session: ImportSession = {
      id: crypto.randomUUID(),
      phase: 'matching',
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      csvSummary: parseResult.summary,
      rows,
    }

    onSessionCreated(session)
  }

  const previewRows = parseResult?.success ? parseResult.rows.slice(0, 5) : []

  return (
    <div style={containerStyle}>
      <div style={sectionStyle}>
        <label style={labelStyle} htmlFor="csv-file-input">
          Upload a CSV file (.csv)
        </label>
        <input
          id="csv-file-input"
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          style={inputStyle}
        />
      </div>

      {parseResult && parseResult.success === false && parseResult.error === 'empty_file' && (
        <p style={errorStyle}>The file is empty or contains no data rows. Please upload a valid CSV file.</p>
      )}

      {parseResult && parseResult.success === false && parseResult.error === 'missing_title_column' && (
        <div style={sectionStyle}>
          <p style={errorStyle}>
            No recognized title column found. Please select which column contains the title:
          </p>
          <div style={{ display: 'flex', alignItems: 'center', marginTop: '8px' }}>
            <select
              style={selectStyle}
              value={remapColumn}
              onChange={(e) => setRemapColumn(e.target.value)}
            >
              {parseResult.availableColumns?.map((col) => (
                <option key={col} value={col}>{col}</option>
              ))}
            </select>
            <button style={buttonPrimaryStyle} onClick={handleRemap}>
              Use as Title Column
            </button>
          </div>
        </div>
      )}

      {parseResult && parseResult.success && (
        <>
          <div style={summaryStyle}>
            <div style={summaryItemStyle}>
              <span style={summaryLabelStyle}>Total Rows</span>
              <span style={summaryValueStyle}>{parseResult.summary.totalRows}</span>
            </div>
            <div style={summaryItemStyle}>
              <span style={summaryLabelStyle}>With Chapters</span>
              <span style={summaryValueStyle}>{parseResult.summary.withChapters}</span>
            </div>
            <div style={summaryItemStyle}>
              <span style={summaryLabelStyle}>With URLs</span>
              <span style={summaryValueStyle}>{parseResult.summary.withUrls}</span>
            </div>
            <div style={summaryItemStyle}>
              <span style={summaryLabelStyle}>With Tags</span>
              <span style={summaryValueStyle}>{parseResult.summary.withTags}</span>
            </div>
          </div>

          {previewRows.length > 0 && (
            <div style={sectionStyle}>
              <p style={{ ...labelStyle, marginBottom: '8px' }}>
                Preview (first {previewRows.length} of {parseResult.summary.totalRows} rows)
              </p>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Title</th>
                    <th style={thStyle}>Chapter</th>
                    <th style={thStyle}>URL</th>
                    <th style={thStyle}>Tags</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => (
                    <tr key={i}>
                      <td style={tdStyle} title={row.csvTitle}>{row.csvTitle}</td>
                      <td style={tdStyle}>{row.csvChapter ?? '—'}</td>
                      <td style={tdStyle} title={row.csvUrl ?? ''}>{row.csvUrl ?? '—'}</td>
                      <td style={tdStyle}>{row.csvTags.length > 0 ? row.csvTags.join(', ') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button style={buttonPrimaryStyle} onClick={handleStartMatching}>
            Start Matching
          </button>
        </>
      )}
    </div>
  )
}
