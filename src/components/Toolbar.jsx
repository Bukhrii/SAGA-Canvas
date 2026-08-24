import React, { useState, useCallback, useEffect, useRef } from 'react'
import ReactDOM from 'react-dom'
import './Toolbar.css'

const ZOOM_MIN = 0.05
const PX_PER_CM = 10

const cmToPx = cm => Math.round(Number(cm) * PX_PER_CM)
const pxToCm = px => Number(px) / PX_PER_CM

const CANVAS_PRESETS = [
  { label: 'Kain Sasirangan Landscape', w: 2000, h: 1100, note: '200 × 110 cm — default' },
  { label: 'Kain Sasirangan Portrait',  w: 1100, h: 2000, note: '110 × 200 cm' },
  { label: 'Kain HD 4×',               w: 4000, h: 2200, note: '400 × 220 cm' },
  { label: 'Kotak 100 × 100 cm',       w: 1000, h: 1000 },
  { label: 'Full HD 192 × 108 cm',     w: 1920, h: 1080 },
  { label: 'HD 128 × 72 cm',           w: 1280, h: 720 },
  { label: 'A4 Portrait',              w: 794, h: 1123 },
  { label: 'Kotak 80 × 80 cm',         w: 800, h: 800 },
]

// Dropdown rendered into body to escape overflow:hidden parents
function FloatingDropdown({ anchorRef, open, align = 'left', children }) {
  const [pos, setPos] = useState({ top: 0, left: 0 })

  useEffect(() => {
    if (!open || !anchorRef.current) return
    const r = anchorRef.current.getBoundingClientRect()
    setPos({
      top:  r.bottom + 6,
      left: align === 'right' ? Math.max(4, r.right - 270) : r.left,
    })
  }, [open, anchorRef, align])

  if (!open) return null
  return ReactDOM.createPortal(
    <div className="tb-dropdown"
      style={{ position: 'fixed', top: pos.top, left: pos.left }}
      onMouseDown={e => e.stopPropagation()}>
      {children}
    </div>,
    document.body
  )
}

export default function Toolbar({
  stageRef,
  canvasItems, canvasSize, setCanvasSize,
  zoom, setZoom,
  bgColor, setBgColor, bgTransparent, setBgTransparent,
  onClear, cropMode, setCropMode, selectedId,
  onUndo, onRedo, canUndo, canRedo,
  // for export: temporarily deselect so transformer is hidden
  onDeselectForExport, onAfterExport,
}) {
  const [openPanel, setOpenPanel]       = useState(null)
  const [exportFormat,  setExportFormat]  = useState('png')
  const [exportScale,   setExportScale]   = useState(1)
  const [exportQuality, setExportQuality] = useState(0.92)
  const [customW, setCustomW] = useState(String(pxToCm(canvasSize.width)))
  const [customH, setCustomH] = useState(String(pxToCm(canvasSize.height)))
  const [exporting, setExporting]       = useState(false)
  const [exportMsg, setExportMsg]       = useState('')

  const canvasBtnRef = useRef(null)
  const exportBtnRef = useRef(null)

  useEffect(() => {
    setCustomW(String(pxToCm(canvasSize.width)))
    setCustomH(String(pxToCm(canvasSize.height)))
  }, [canvasSize.width, canvasSize.height])

  useEffect(() => {
    if (!openPanel) return
    const handler = e => {
      const drops = document.querySelectorAll('.tb-dropdown')
      for (const d of drops) if (d.contains(e.target)) return
      setOpenPanel(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [openPanel])

  const toggle = panel => setOpenPanel(p => (p === panel ? null : panel))

// ── Canvas size ─────────────────────────────────────────────────────────

const applyPreset = (w, h) => {
  setCanvasSize({
    width: w,
    height: h,
  })
  setOpenPanel(null)
}

const applyCustom = () => {
  const wCm = parseFloat(customW)
  const hCm = parseFloat(customH)

  if (
    !Number.isFinite(wCm) ||
    !Number.isFinite(hCm) ||
    wCm <= 0 ||
    hCm <= 0
  ) {
    alert('Masukkan ukuran canvas yang valid dalam centimeter.')
    return
  }

  const w = Math.min(cmToPx(wCm), 8000)
  const h = Math.min(cmToPx(hCm), 8000)

  setCanvasSize({
    width: w,
    height: h,
  })

  setOpenPanel(null)
}
  // ── Core render function: export at full quality ────────────────────────
  // Strategy:
  //   1. Deselect item → transformer disappears
  //   2. Reset stage pan+zoom to identity (0,0,scale=1)
  //   3. toCanvas({ pixelRatio: exportScale, x:0, y:0, w, h }) renders at NATIVE resolution
  //   4. Restore everything
  const renderToBlob = useCallback(async (mimeType, quality) => {
    const stage = stageRef.current
    if (!stage) throw new Error('Stage belum siap')

    // Step 1: hide selection (transformer)
    if (onDeselectForExport) onDeselectForExport()
    await new Promise(r => setTimeout(r, 20))  // let React re-render

    const savedX  = stage.x()
    const savedY  = stage.y()
    const savedSX = stage.scaleX()
    const savedSY = stage.scaleY()

    // Step 2: reset to 1:1, canvas rect sits at (0,0) in unscaled coords
    stage.x(0); stage.y(0); stage.scaleX(1); stage.scaleY(1)
    stage.batchDraw()
    await new Promise(r => setTimeout(r, 20))

    let blob
    try {
      // Step 3: render - pixelRatio multiplies every pixel → no blur
      const stageCanvas = stage.toCanvas({
        pixelRatio: exportScale,
        x:      0,
        y:      0,
        width:  canvasSize.width,
        height: canvasSize.height,
      })
      blob = await new Promise((res, rej) =>
        stageCanvas.toBlob(
          b => b ? res(b) : rej(new Error('toBlob gagal')),
          mimeType, quality
        )
      )
    } finally {
      // Step 4: restore
      stage.x(savedX); stage.y(savedY); stage.scaleX(savedSX); stage.scaleY(savedSY)
      stage.batchDraw()
      if (onAfterExport) onAfterExport()
    }
    return blob
  }, [stageRef, canvasSize, exportScale, onDeselectForExport, onAfterExport])

  const blobToDataURL = blob => new Promise((res, rej) => {
    const r = new FileReader()
    r.onload  = () => res(r.result)
    r.onerror = rej
    r.readAsDataURL(blob)
  })

  const triggerDownload = (src, filename) => {
    const a = document.createElement('a')
    a.href = src; a.download = filename
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
  }

  // ── Export ──────────────────────────────────────────────────────────────
  const doExport = useCallback(async () => {
    setExporting(true); setExportMsg('')
    try {
      const outW = canvasSize.width  * exportScale
      const outH = canvasSize.height * exportScale

      if (exportFormat === 'svg') {
        const blob    = await renderToBlob('image/png', 1)
        const dataURL = await blobToDataURL(blob)
        const svg = [
          '<?xml version="1.0" encoding="UTF-8"?>',
          `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${outW}" height="${outH}" viewBox="0 0 ${outW} ${outH}">`,
          `  <image width="${outW}" height="${outH}" xlink:href="${dataURL}"/>`,
          '</svg>',
        ].join('\n')
        const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
        triggerDownload(url, `sasirangan_${Date.now()}.svg`)
        setTimeout(() => URL.revokeObjectURL(url), 5000)
        setExportMsg(`✓ SVG — ${outW}×${outH} px`)
        return
      }

      const mimeMap = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }
      const mimeType = mimeMap[exportFormat] || 'image/png'
      const quality  = (exportFormat === 'jpg' || exportFormat === 'webp') ? exportQuality : undefined

      const blob    = await renderToBlob(mimeType, quality)
      const dataURL = await blobToDataURL(blob)
      triggerDownload(dataURL, `sasirangan_${Date.now()}.${exportFormat}`)
      setExportMsg(`✓ ${outW}×${outH} px diunduh`)
    } catch (err) {
      console.error(err)
      setExportMsg('✗ ' + err.message)
    } finally {
      setExporting(false)
    }
  }, [renderToBlob, exportFormat, exportQuality, canvasSize, exportScale])

  const doCopyClipboard = useCallback(async () => {
    setExportMsg('')
    try {
      const blob = await renderToBlob('image/png', 1)
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setExportMsg('✓ Disalin ke clipboard')
    } catch (err) {
      setExportMsg('✗ ' + err.message)
    }
  }, [renderToBlob])

  return (
    <div className="toolbar">

      {/* Undo / Redo */}
      <div className="toolbar-group">
        <button className="tb-btn tb-btn--icon" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">↩</button>
        <button className="tb-btn tb-btn--icon" onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Y)">↪</button>
      </div>
      <div className="toolbar-sep" />

      {/* Zoom */}
      <div className="toolbar-group">
        <button className="tb-btn tb-btn--icon" onClick={() => setZoom(z => +(Math.max(ZOOM_MIN, z-0.1)).toFixed(2))}>−</button>
        <span className="zoom-display">{Math.round(zoom*100)}%</span>
        <button className="tb-btn tb-btn--icon" onClick={() => setZoom(z => +(Math.min(ZOOM_MAX, z+0.1)).toFixed(2))}>+</button>
        <button className="tb-btn" onClick={() => setZoom(1)} title="Zoom 100%">1:1</button>
        <button className="tb-btn" onClick={() => setZoom(0.4)} title="Fit ke layar">Fit</button>
      </div>
      <div className="toolbar-sep" />

      {/* Canvas size */}
      <div className="toolbar-group">
        <button ref={canvasBtnRef}
          className={`tb-btn ${openPanel==='canvas' ? 'tb-btn--active' : ''}`}
          onClick={() => toggle('canvas')}>
          ⊞ Kanva <span className="tb-btn-dim">{pxToCm(canvasSize.width)}×{pxToCm(canvasSize.height)} cm</span>
        </button>
        <FloatingDropdown anchorRef={canvasBtnRef} open={openPanel==='canvas'} align="left">
          <div className="tb-dropdown-section">
            <div className="tb-label">Preset ukuran</div>
            {CANVAS_PRESETS.map((p,i) => (
              <button key={i}
                className={`tb-dropdown-item ${canvasSize.width===p.w && canvasSize.height===p.h ? 'tb-dropdown-item--active':''}`}
                onClick={() => applyPreset(p.w, p.h)}>
                {p.label} — <span style={{opacity:0.65}}>{p.w}×{p.h}</span>
                {p.note && <span className="tb-dropdown-note">{p.note}</span>}
              </button>
            ))}
          </div>
          <div className="tb-dropdown-section">
  <div className="tb-label">Ukuran kustom (centimeter)</div>

  <div className="tb-row">
      <span className="tb-input-label">L</span>

      <input
        type="number"
        className="tb-number"
        value={customW}
        min={1}
        max={800}
        step={0.1}
        onChange={e => setCustomW(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && applyCustom()}
      />

      <span className="tb-x">×</span>

      <span className="tb-input-label">T</span>

      <input
        type="number"
        className="tb-number"
        value={customH}
        min={1}
        max={800}
        step={0.1}
        onChange={e => setCustomH(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && applyCustom()}
      />

      <span className="tb-unit">cm</span>
    </div>

    <button
      className="tb-apply-btn"
      style={{ marginTop: 8 }}
      onClick={applyCustom}
    >
      ✓ Terapkan Ukuran
    </button>
  </div>
          <div className="tb-dropdown-section">
            <div className="tb-label">Latar belakang</div>
            <label className="tb-row" style={{gap:8, cursor:'pointer'}}>
              <input type="checkbox" checked={bgTransparent} onChange={e => setBgTransparent(e.target.checked)} />
              <span className="tb-check-label">Transparan</span>
            </label>
            {!bgTransparent && (
              <div className="tb-row" style={{marginTop:8}}>
                <input type="color" className="tb-color-input" value={bgColor} onChange={e => setBgColor(e.target.value)} />
                <span className="tb-color-hex">{bgColor}</span>
              </div>
            )}
          </div>
        </FloatingDropdown>
      </div>
      <div className="toolbar-sep" />

      {/* Crop */}
      {selectedId && (
        <>
          <button className={`tb-btn ${cropMode ? 'tb-btn--crop' : ''}`} onClick={() => setCropMode(c => !c)}>✂ Crop</button>
          <div className="toolbar-sep" />
        </>
      )}

      {/* Export */}
      <div className="toolbar-group">
        <button ref={exportBtnRef}
          className={`tb-btn tb-btn--export ${openPanel==='export' ? 'tb-btn--active' : ''}`}
          onClick={() => toggle('export')}>
          ↓ Export
        </button>
        <FloatingDropdown anchorRef={exportBtnRef} open={openPanel==='export'} align="right">
          <div className="tb-dropdown-section">
            <div className="tb-label">Format file</div>
            <div className="format-grid">
              {['png','jpg','webp','svg'].map(fmt => (
                <button key={fmt}
                  className={`format-btn ${exportFormat===fmt ? 'format-btn--active':''}`}
                  onClick={() => setExportFormat(fmt)}>.{fmt.toUpperCase()}</button>
              ))}
            </div>
          </div>
          <div className="tb-dropdown-section">
            <div className="tb-label">Skala resolusi output</div>
            <div className="tb-row">
              {[1,2,3].map(s => (
                <button key={s} className={`scale-btn ${exportScale===s ? 'scale-btn--active':''}`}
                  onClick={() => setExportScale(s)}>{s}×</button>
              ))}
            </div>
            <p className="tb-hint">Output: {canvasSize.width*exportScale} × {canvasSize.height*exportScale} px</p>
          </div>
          {(exportFormat==='jpg'||exportFormat==='webp') && (
            <div className="tb-dropdown-section">
              <div className="tb-label">Kualitas: {Math.round(exportQuality*100)}%</div>
              <input type="range" min={0.5} max={1} step={0.01}
                value={exportQuality} onChange={e => setExportQuality(+e.target.value)} className="tb-range" />
            </div>
          )}
          <div className="tb-dropdown-section">
            <button className="export-main-btn" onClick={doExport} disabled={exporting}>
              {exporting ? '⏳ Memproses...' : `↓ Unduh .${exportFormat.toUpperCase()}`}
            </button>
            <button className="copy-btn" onClick={doCopyClipboard}>⊕ Salin ke Clipboard</button>
            {exportMsg && (
              <p className={`export-msg ${exportMsg.startsWith('✓') ? 'export-msg--ok' : 'export-msg--err'}`}>{exportMsg}</p>
            )}
          </div>
        </FloatingDropdown>
      </div>
      <div className="toolbar-sep" />

      {/* Clear */}
      <button className="tb-btn tb-btn--danger"
        onClick={() => canvasItems.length>0 && window.confirm('Hapus semua objek di canvas?') && onClear()}>
        ⊗ Reset Canvas
      </button>
    </div>
  )
}
