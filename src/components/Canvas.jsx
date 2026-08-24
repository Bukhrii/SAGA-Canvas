import React, { useRef, useEffect, useState, useCallback } from 'react'
import { Stage, Layer, Rect, Image as KImage, Transformer, Line, Shape } from 'react-konva'
import useImage from 'use-image'
import './Canvas.css'

const ZOOM_MIN = 0.1
const ZOOM_MAX = 5

// ── Grid ─────────────────────────────────────────────────────────────────────
function GridLayer({ grid, canvasSize }) {
  if (!grid.enabled || grid.type === 'none') return null
  const { width, height } = canvasSize
  const { size, color, opacity, type } = grid
  const lines = []
  if (type === 'square') {
    for (let x = 0; x <= width; x += size)
      lines.push(<Line key={`v${x}`} points={[x,0,x,height]} stroke={color} strokeWidth={0.5} opacity={opacity} />)
    for (let y = 0; y <= height; y += size)
      lines.push(<Line key={`h${y}`} points={[0,y,width,y]} stroke={color} strokeWidth={0.5} opacity={opacity} />)
  } else if (type === 'diamond') {
    const total = Math.ceil((width + height) / size) * 2
    for (let i = -total; i <= total; i++) {
      const o = i * size
      lines.push(<Line key={`d1${i}`} points={[o,0,o+height,height]} stroke={color} strokeWidth={0.5} opacity={opacity} />)
      lines.push(<Line key={`d2${i}`} points={[o,0,o-height,height]} stroke={color} strokeWidth={0.5} opacity={opacity} />)
    }
  }
  return <Layer listening={false}>{lines}</Layer>
}

// ── Motif image ───────────────────────────────────────────────────────────────
function MotifImage({ item, isSelected, onSelect, onChange, cropMode }) {
  const [image] = useImage(item.src, 'anonymous')
  const imgRef = useRef()
  const trRef  = useRef()

  useEffect(() => {
    const node = imgRef.current
    const transformer = trRef.current

    if (!node || !transformer) return

    if (isSelected && !cropMode) {
      transformer.nodes([node])

      // Pastikan Transformer membaca ukuran terbaru
      // dari React state.
      transformer.forceUpdate()

      // Render langsung tanpa menunggu event canvas berikutnya.
      transformer.getLayer()?.batchDraw()
    } else {
      transformer.nodes([])
    }
  }, [
    isSelected,
    cropMode,
    image,
    item.x,
    item.y,
    item.width,
    item.height,
    item.rotation,
    item.flipX,
    item.flipY,
  ])

  const handleTransformEnd = () => {
    const n = imgRef.current
    if (!n) return

    const scaleX = n.scaleX()
    const scaleY = n.scaleY()

    const newWidth = Math.max(
      10,
      Math.abs(n.width() * scaleX)
    )

    const newHeight = Math.max(
      10,
      Math.abs(n.height() * scaleY)
    )

    const newX = n.x()
    const newY = n.y()
    const newRotation = n.rotation()

    // Reset transform node terlebih dahulu.
    n.scaleX(1)
    n.scaleY(1)

    // Sinkronkan layer Konva segera.
    n.getLayer()?.batchDraw()

    // Kemudian update React state.
    onChange({
      x: newX,
      y: newY,
      rotation: newRotation,
      width: newWidth,
      height: newHeight,
    })
  }

  return (
    <>
      <KImage
        ref={imgRef}
        image={image}
        x={item.x}
        y={item.y}
        width={item.width}
        height={item.height}
        rotation={item.rotation}
        opacity={item.opacity ?? 1}
        scaleX={item.flipX ? -1 : 1}
        scaleY={item.flipY ? -1 : 1}
        offsetX={item.flipX ? item.width : 0}
        offsetY={item.flipY ? item.height : 0}
        draggable={!cropMode}
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={e =>
          onChange({
            x: e.target.x(),
            y: e.target.y(),
          })
        }
        onTransform={() => {
          imgRef.current?.getLayer()?.batchDraw()
        }}
        onTransformEnd={handleTransformEnd}
      />
      {isSelected && !cropMode && (
        <Transformer
          ref={trRef}
          rotateEnabled
          keepRatio={false}
          enabledAnchors={['top-left','top-center','top-right','middle-right','middle-left','bottom-left','bottom-center','bottom-right']}
          boundBoxFunc={(old, n) => (n.width < 10 || n.height < 10 ? old : n)}
        />
      )}
    </>
  )
}

// ── Crop overlay — DOM based ──────────────────────────────────────────────────
// HOW CROP WORKS:
// The crop rect (x,y,w,h) is in *item display coordinates* (same units as item.width/height).
// When "Terapkan" is clicked, we do an offscreen canvas render:
//   1. Draw the full original image into an offscreen canvas sized to item.width × item.height
//   2. Extract only the crop rectangle as a new PNG data URL
//   3. Replace item.src with that PNG, reset item.width/height to crop.width/height, move x/y
// This gives a REAL crop — the image data itself is permanently trimmed.

function CropOverlayDOM({ item, zoom, stagePos, onApply, onCancel }) {
  const [rect, setRect] = useState({ x: 0, y: 0, width: item.width, height: item.height })
  const dragRef = useRef(null)
  const iw = item.width
  const ih = item.height

  const ts = v => v * zoom
  const fs = v => v / zoom
  const ox = stagePos.x + item.x * zoom
  const oy = stagePos.y + item.y * zoom

  const handles = [
    { id:'nw', sx: rect.x,              sy: rect.y               },
    { id:'n',  sx: rect.x+rect.width/2, sy: rect.y               },
    { id:'ne', sx: rect.x+rect.width,   sy: rect.y               },
    { id:'e',  sx: rect.x+rect.width,   sy: rect.y+rect.height/2 },
    { id:'se', sx: rect.x+rect.width,   sy: rect.y+rect.height   },
    { id:'s',  sx: rect.x+rect.width/2, sy: rect.y+rect.height   },
    { id:'sw', sx: rect.x,              sy: rect.y+rect.height   },
    { id:'w',  sx: rect.x,              sy: rect.y+rect.height/2 },
  ]

  const startDrag = (e, type) => {
    e.preventDefault(); e.stopPropagation()
    dragRef.current = { type, mx: e.clientX, my: e.clientY, start: { ...rect } }
  }

  useEffect(() => {
    const onMove = e => {
      if (!dragRef.current) return
      const { type, mx, my, start } = dragRef.current
      const dx = fs(e.clientX - mx)
      const dy = fs(e.clientY - my)
      let { x, y, width, height } = start
      if (type === 'move') {
        x = Math.max(0, Math.min(iw - width,  x + dx))
        y = Math.max(0, Math.min(ih - height, y + dy))
      } else {
        if (type.includes('e')) width  = Math.max(20, width  + dx)
        if (type.includes('s')) height = Math.max(20, height + dy)
        if (type.includes('w')) { x += dx; width  = Math.max(20, width  - dx) }
        if (type.includes('n')) { y += dy; height = Math.max(20, height - dy) }
        x      = Math.max(0, Math.min(iw - 20, x))
        y      = Math.max(0, Math.min(ih - 20, y))
        width  = Math.min(iw - x, Math.max(20, width))
        height = Math.min(ih - y, Math.max(20, height))
      }
      setRect({ x, y, width, height })
    }
    const onUp = () => { dragRef.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [zoom, iw, ih])

  const cx = ox + ts(rect.x)
  const cy = oy + ts(rect.y)
  const cw = ts(rect.width)
  const ch = ts(rect.height)

  const mask = (left, top, w, h) => ({
    position:'absolute', left, top, width: Math.max(0,w), height: Math.max(0,h),
    background:'rgba(0,0,0,0.55)', pointerEvents:'none',
  })

  return (
    <div style={{ position:'absolute', inset:0, pointerEvents:'none', zIndex:60 }}>
      <div style={mask(ox, oy, ts(iw), ts(rect.y))} />
      <div style={mask(ox, cy+ch, ts(iw), Math.max(0, ts(ih)-ts(rect.y)-ch))} />
      <div style={mask(ox, cy, ts(rect.x), ch)} />
      <div style={mask(cx+cw, cy, Math.max(0, ts(iw)-ts(rect.x)-cw), ch)} />

      <div
        style={{ position:'absolute', left:cx, top:cy, width:cw, height:ch,
          border:'1.5px solid #c8953a', boxSizing:'border-box', cursor:'move', pointerEvents:'all' }}
        onMouseDown={e => startDrag(e, 'move')}
      >
        {[1/3,2/3].map(f => (
          <React.Fragment key={f}>
            <div style={{position:'absolute',left:`${f*100}%`,top:0,bottom:0,borderLeft:'1px dashed rgba(200,149,58,0.35)',pointerEvents:'none'}}/>
            <div style={{position:'absolute',top:`${f*100}%`,left:0,right:0,borderTop:'1px dashed rgba(200,149,58,0.35)',pointerEvents:'none'}}/>
          </React.Fragment>
        ))}
        <div style={{position:'absolute',bottom:3,right:4,fontSize:9,background:'rgba(0,0,0,0.65)',
          color:'#c8953a',padding:'1px 5px',borderRadius:3,fontFamily:'monospace',pointerEvents:'none'}}>
          {Math.round(rect.width)} × {Math.round(rect.height)}
        </div>
      </div>

      {handles.map(h => (
        <div key={h.id} style={{ position:'absolute',
          left: ox+ts(h.sx)-5, top: oy+ts(h.sy)-5, width:10, height:10,
          background:'#c8953a', border:'1.5px solid #fff', borderRadius:2,
          cursor: h.id+'-resize', pointerEvents:'all' }}
          onMouseDown={e => startDrag(e, h.id)}
        />
      ))}

      <div style={{ position:'absolute', left:ox, top: oy+ts(ih)+10,
        display:'flex', gap:8, pointerEvents:'all' }}>
        <button className="crop-btn crop-btn--apply"  onClick={() => onApply({ ...rect })}>✓ Terapkan</button>
        <button className="crop-btn crop-btn--reset"  onClick={() => setRect({ x:0, y:0, width:iw, height:ih })}>↺ Reset</button>
        <button className="crop-btn crop-btn--cancel" onClick={onCancel}>× Batal</button>
      </div>
    </div>
  )
}

// ── Bake crop using offscreen canvas ─────────────────────────────────────────
// This actually crops the image DATA, not just clips the display.
// Result: item.src becomes a new PNG of exactly crop.width × crop.height pixels.
function bakeCrop(item, crop) {
  return new Promise(resolve => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      // item.width/height = display size we rendered at
      // img.naturalWidth/Height = original PNG pixel size
      // crop.x/y/w/h = in display units
      const scaleX = img.naturalWidth  / item.width
      const scaleY = img.naturalHeight / item.height

      const srcX = Math.round(crop.x      * scaleX)
      const srcY = Math.round(crop.y      * scaleY)
      const srcW = Math.round(crop.width  * scaleX)
      const srcH = Math.round(crop.height * scaleY)

      const offscreen = document.createElement('canvas')
      offscreen.width  = srcW
      offscreen.height = srcH
      const ctx = offscreen.getContext('2d')
      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH)

      resolve(offscreen.toDataURL('image/png'))
    }
    img.onerror = () => resolve(null)
    img.src = item.src
  })
}

// ── Main Canvas ───────────────────────────────────────────────────────────────
export default function Canvas({
  stageRef, items, selectedId, setSelectedId,
  grid, canvasSize, zoom, setZoom, bgColor, bgTransparent,
  onUpdateItem, onDeleteItem, cropMode, setCropMode,
}) {
  const containerRef = useRef(null)
  const [stagePos, setStagePos]   = useState({ x: 60, y: 60 })
  const [isPanning, setIsPanning] = useState(false)
  const panRef = useRef(null)
  const [containerSize, setContainerSize] = useState({ w: 800, h: 600 })
  const [cropApplying, setCropApplying] = useState(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() =>
      setContainerSize({ w: el.clientWidth, h: el.clientHeight })
    )
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Center canvas when size changes
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    setStagePos({
      x: Math.max(30, (el.clientWidth  - canvasSize.width  * zoom) / 2),
      y: Math.max(30, (el.clientHeight - canvasSize.height * zoom) / 2),
    })
  }, [canvasSize])

  // Keyboard
  useEffect(() => {
    const handler = e => {
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (!selectedId) return
      if (e.key === 'Delete' || e.key === 'Backspace') { onDeleteItem(selectedId); return }
      const step = e.shiftKey ? 10 : 1
      const item = items.find(i => i.id === selectedId)
      if (!item) return
      if (e.key === 'ArrowLeft')  { e.preventDefault(); onUpdateItem(selectedId, { x: item.x - step }) }
      if (e.key === 'ArrowRight') { e.preventDefault(); onUpdateItem(selectedId, { x: item.x + step }) }
      if (e.key === 'ArrowUp')    { e.preventDefault(); onUpdateItem(selectedId, { y: item.y - step }) }
      if (e.key === 'ArrowDown')  { e.preventDefault(); onUpdateItem(selectedId, { y: item.y + step }) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedId, items, onUpdateItem, onDeleteItem])

  const handleWheel = useCallback(e => {
    e.evt.preventDefault()
    const stage = stageRef.current
    if (!stage) return
    const ptr = stage.getPointerPosition()
    const mc  = { x: (ptr.x - stagePos.x) / zoom, y: (ptr.y - stagePos.y) / zoom }
    let nz = e.evt.deltaY < 0 ? zoom * 1.06 : zoom / 1.06
    nz = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +nz.toFixed(4)))
    setZoom(nz)
    setStagePos({ x: ptr.x - mc.x * nz, y: ptr.y - mc.y * nz })
  }, [zoom, stagePos, stageRef, setZoom])

  const handleMouseDown = useCallback(e => {
    const isBg =
      e.target === e.target.getStage() ||
      e.target.name() === 'bg'

    if (isBg) {
      setSelectedId(null)

      // Jika klik area canvas, selalu keluar dari crop mode.
      setCropMode(false)

      if (e.evt.button === 1 || e.evt.altKey) {
        setIsPanning(true)

        panRef.current = {
          x: e.evt.clientX - stagePos.x,
          y: e.evt.clientY - stagePos.y,
        }
      }
    }
  }, [stagePos, setSelectedId, setCropMode])

  const handleMouseMove = useCallback(e => {
    if (isPanning && panRef.current)
      setStagePos({ x: e.evt.clientX - panRef.current.x, y: e.evt.clientY - panRef.current.y })
  }, [isPanning])

  const handleMouseUp = useCallback(() => { setIsPanning(false); panRef.current = null }, [])

  const handleDragEnd = useCallback((id, x, y) => {
    let nx = x, ny = y
    if (grid.snap && grid.enabled) {
      nx = Math.round(x / grid.size) * grid.size
      ny = Math.round(y / grid.size) * grid.size
    }
    onUpdateItem(id, { x: nx, y: ny })
  }, [grid, onUpdateItem])

  // ── Apply crop: actually bake into new image data ─────────────────────────
  const applyCrop = useCallback(async (crop, item) => {
    if (!item || cropApplying) return
    setCropApplying(true)
    try {
      const newSrc = await bakeCrop(item, crop)
      if (!newSrc) { alert('Crop gagal: gambar tidak bisa dimuat.'); return }

      // Account for rotation when offsetting position
      const angle  = (item.rotation || 0) * Math.PI / 180
      const cosA   = Math.cos(angle)
      const sinA   = Math.sin(angle)
      const worldDx = crop.x * cosA - crop.y * sinA
      const worldDy = crop.x * sinA + crop.y * cosA

      onUpdateItem(item.id, {
        src:    newSrc,
        x:      item.x + worldDx,
        y:      item.y + worldDy,
        width:  crop.width,
        height: crop.height,
        crop:   null,
      })
      setCropMode(false)
    } finally {
      setCropApplying(false)
    }
  }, [onUpdateItem, setCropMode, cropApplying])

  const selectedItem = items.find(i => i.id === selectedId) ?? null

  return (
    <div
      ref={containerRef}
      className={`canvas-container ${isPanning ? 'canvas-panning' : ''}`}
      style={{ position:'relative', width:'100%', height:'100%', overflow:'hidden' }}
    >
      <Stage
        ref={stageRef}
        width={containerSize.w || 800}
        height={containerSize.h || 600}
        x={stagePos.x}
        y={stagePos.y}
        scaleX={zoom}
        scaleY={zoom}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        style={{ cursor: isPanning ? 'grabbing' : 'default' }}
      >
        <Layer>
          {bgTransparent ? (
            <Shape sceneFunc={ctx => {
              const ts = 10
              for (let x = 0; x < canvasSize.width; x += ts)
                for (let y = 0; y < canvasSize.height; y += ts) {
                  ctx.fillStyle = ((x/ts+y/ts)%2===0) ? '#cccccc' : '#999999'
                  ctx.fillRect(x, y, ts, ts)
                }
            }} listening={false} />
          ) : (
            <Rect name="bg" x={0} y={0}
              width={canvasSize.width} height={canvasSize.height}
              fill={bgColor}
              shadowBlur={16} shadowColor="#000" shadowOpacity={0.35}
            />
          )}
          <Rect x={0} y={0} width={canvasSize.width} height={canvasSize.height}
            stroke="rgba(255,255,255,0.08)" strokeWidth={1} listening={false} />
        </Layer>

        <GridLayer grid={grid} canvasSize={canvasSize} />

        <Layer>
          {items.map(item => (
            <MotifImage
              key={item.id}
              item={item}
              isSelected={selectedId === item.id}
              onSelect={() => { if (!cropMode) setSelectedId(item.id) }}
              onChange={upd => onUpdateItem(item.id, upd)}
              cropMode={cropMode}
            />
          ))}
        </Layer>
      </Stage>

      {cropMode && selectedItem && (
        <CropOverlayDOM
          key={selectedItem.id + '_crop'}
          item={selectedItem}
          zoom={zoom}
          stagePos={stagePos}
          onApply={crop => applyCrop(crop, selectedItem)}
          onCancel={() => setCropMode(false)}
        />
      )}

      {cropApplying && (
        <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.4)',
          display:'flex', alignItems:'center', justifyContent:'center', zIndex:80 }}>
          <div style={{ background:'var(--bg-panel)', border:'1px solid var(--border-mid)',
            borderRadius:10, padding:'16px 24px', color:'var(--accent-gold)', fontSize:14 }}>
            ✂ Memproses crop...
          </div>
        </div>
      )}

      <div className="canvas-info">
        <span>{canvasSize.width} × {canvasSize.height} px</span>
        <span>{Math.round(zoom * 100)}%</span>
        <span>{items.length} objek</span>
        {cropMode
          ? <span style={{color:'#c8953a'}}>✂ Geser handle · klik Terapkan</span>
          : <span className="canvas-hint">Scroll=zoom · Alt+drag=pan</span>
        }
      </div>
    </div>
  )
}
