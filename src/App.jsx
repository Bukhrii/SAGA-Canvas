import React, { useState, useRef, useCallback, useEffect } from 'react'
import Sidebar from './components/Sidebar.jsx'
import Canvas from './components/Canvas.jsx'
import Toolbar from './components/Toolbar.jsx'
import PropertiesPanel from './components/PropertiesPanel.jsx'
import { useHistory } from './hooks/useHistory.js'
import './App.css'

const DEFAULT_CANVAS = { width: 2000, height: 1100 }
const SIDEBAR_DEFAULT  = 220
const PROPS_DEFAULT    = 240
const SIDEBAR_MIN      = 0
const SIDEBAR_MAX      = 400
const PROPS_MIN        = 0
const PROPS_MAX        = 420
const STORAGE_KEY = 'saga-canvas-project-v1'

function loadSavedProject() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    const data = JSON.parse(raw)

    if (!data || typeof data !== 'object') return null

    return {
      canvasItems: Array.isArray(data.canvasItems) ? data.canvasItems : [],
      canvasSize:
        data.canvasSize &&
        Number.isFinite(data.canvasSize.width) &&
        Number.isFinite(data.canvasSize.height)
          ? data.canvasSize
          : DEFAULT_CANVAS,
      grid:
        data.grid &&
        Number.isFinite(data.grid.size)
          ? data.grid
          : {
              enabled: true,
              type: 'square',
              size: 100,
              opacity: 0.25,
              color: '#000000',
              snap: false,
            },
      bgColor:
        typeof data.bgColor === 'string'
          ? data.bgColor
          : '#ffffff',
      bgTransparent: Boolean(data.bgTransparent),
      zoom:
        Number.isFinite(data.zoom)
          ? data.zoom
          : 0.4,
    }
  } catch (err) {
    console.error('Gagal memuat project:', err)
    return null
  }
}

const savedProject = loadSavedProject()

const [grid, setGrid] = useState(
  savedProject?.grid ?? {
    enabled: true,
    type: 'square',
    size: 100,
    opacity: 0.25,
    color: '#000000',
    snap: false,
  }
)

const [canvasSize, setCanvasSize] = useState(
  savedProject?.canvasSize ?? DEFAULT_CANVAS
)

const [zoom, setZoom] = useState(
  savedProject?.zoom ?? 0.4
)

const [bgColor, setBgColor] = useState(
  savedProject?.bgColor ?? '#ffffff'
)

const [bgTransparent, setBgTransparent] = useState(
  savedProject?.bgTransparent ?? false
)
export default function App() {
  const [motifs, setMotifs]             = useState([])
  const [selectedId, setSelectedId]     = useState(null)
  const [grid, setGrid] = useState({
    enabled: true,
    type: 'square',
    size: 100,
    opacity: 0.25,
    color: '#000000',
    snap: false,
  })
  const [canvasSize, setCanvasSize]     = useState(DEFAULT_CANVAS)
  const [zoom, setZoom]                 = useState(0.4)
  const [cropMode, setCropMode]         = useState(false)
  const [bgColor, setBgColor]           = useState('#ffffff')
  const [bgTransparent, setBgTransparent] = useState(false)

  // Resizable panels
  const [sidebarW, setSidebarW]         = useState(SIDEBAR_DEFAULT)
  const [propsW, setPropsW]             = useState(PROPS_DEFAULT)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [propsCollapsed, setPropsCollapsed]     = useState(false)

  // Mobile: which panel is shown in bottom sheet
  const [mobilePanel, setMobilePanel]   = useState(null) // 'sidebar'|'props'|null

  const stageRef = useRef(null)

  const {
    state: canvasItems,
    setState: setCanvasItems,
    undo,
    redo,
    canUndo,
    canRedo
  } = useHistory(savedProject?.canvasItems ?? [])

  // Load built-in motifs
  useEffect(() => {
    fetch('./motif-manifest.json')
      .then(r => r.ok ? r.json() : [])
      .then(list => {
        if (!Array.isArray(list) || !list.length) return
        setMotifs(list.map(m => ({
          id: `builtin_${m.file}`, name: m.name, src: m.file, isBuiltin: true,
        })))
      })
      .catch(() => {})
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
  const project = {
    version: 1,
    canvasItems,
    canvasSize,
    grid,
    bgColor,
    bgTransparent,
    zoom,
    savedAt: Date.now(),
  }

  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(project)
    )
  } catch (err) {
    console.error('Gagal menyimpan project:', err)
  }
}, [
  canvasItems,
  canvasSize,
  grid,
  bgColor,
  bgTransparent,
  zoom,
])

  // Item mutations
  const addMotif = useCallback(motif => {
    const item = {
      id: `item_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
      src: motif.src, name: motif.name,
      x: 60 + Math.random() * 200, y: 60 + Math.random() * 150,
      width: 200, height: 200,
      rotation: 0, opacity: 1, flipX: false, flipY: false, crop: null,
    }
    setCanvasItems(prev => [...prev, item])
    setSelectedId(item.id)
    setMobilePanel(null)
  }, [setCanvasItems])

  const updateItem   = useCallback((id, upd, opts = {}) =>
    setCanvasItems(prev => prev.map(i => i.id === id ? { ...i, ...upd } : i), opts), [setCanvasItems])
  const deleteItem = useCallback(id => {
    setCanvasItems(prev => prev.filter(i => i.id !== id))

    setSelectedId(s => {
      if (s === id) {
        setCropMode(false)
        return null
      }

      return s
    })
  }, [setCanvasItems])
  const duplicateItem = useCallback(id => {
    setCanvasItems(prev => {
      const it = prev.find(i => i.id === id); if (!it) return prev
      const nw = { ...it, id: `item_${Date.now()}_${Math.random().toString(36).slice(2,7)}`, x: it.x+20, y: it.y+20 }
      setTimeout(() => setSelectedId(nw.id), 0)
      return [...prev, nw]
    })
  }, [setCanvasItems])
  const bringForward = useCallback(id => setCanvasItems(prev => {
    const i = prev.findIndex(x => x.id === id); if (i >= prev.length-1) return prev
    const a=[...prev];[a[i],a[i+1]]=[a[i+1],a[i]]; return a
  }), [setCanvasItems])
  const sendBackward = useCallback(id => setCanvasItems(prev => {
    const i = prev.findIndex(x => x.id === id); if (i<=0) return prev
    const a=[...prev];[a[i],a[i-1]]=[a[i-1],a[i]]; return a
  }), [setCanvasItems])
  const clearCanvas  = useCallback(() => { setCanvasItems([]); setSelectedId(null) }, [setCanvasItems])

  // For clean export: temporarily hide transformer by deselecting
  const exportSelectedRef = useRef(null)
  const onDeselectForExport = useCallback(() => {
    exportSelectedRef.current = selectedId
    setSelectedId(null)
  }, [selectedId])
  const onAfterExport = useCallback(() => {
    if (exportSelectedRef.current) setSelectedId(exportSelectedRef.current)
    exportSelectedRef.current = null
  }, [])

  const selectedItem = canvasItems.find(i => i.id === selectedId) ?? null
  useEffect(() => {
  // Crop hanya boleh aktif jika masih ada objek yang dipilih.
    if (!selectedId && cropMode) {
      setCropMode(false)
    }
  }, [selectedId, cropMode])
  // Drag-resize sidebar
  const dragSidebar = useCallback(e => {
    e.preventDefault()
    const startX = e.clientX, startW = sidebarW
    const onMove = mv => {
      const nw = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, startW + mv.clientX - startX))
      setSidebarW(nw)
      if (nw < 40) setSidebarCollapsed(true)
      else setSidebarCollapsed(false)
    }
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [sidebarW])

  // Drag-resize props panel
  const dragProps = useCallback(e => {
    e.preventDefault()
    const startX = e.clientX, startW = propsW
    const onMove = mv => {
      const nw = Math.max(PROPS_MIN, Math.min(PROPS_MAX, startW - (mv.clientX - startX)))
      setPropsW(nw)
      if (nw < 40) setPropsCollapsed(true)
      else setPropsCollapsed(false)
    }
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [propsW])

  const effectiveSidebarW = sidebarCollapsed ? 0 : sidebarW
  const effectivePropsW   = propsCollapsed   ? 0 : propsW

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-brand">
          <span className="brand-icon">✦</span>
          <span className="brand-name">SAGA</span>
          <span className="brand-tagline">Sasirangan Studio</span>
        </div>

        {/* Mobile panel toggles */}
        <div className="mobile-panel-btns">
          <button className={`mpb ${mobilePanel==='sidebar'?'mpb--active':''}`}
            onClick={() => setMobilePanel(p => p==='sidebar' ? null : 'sidebar')}>
            ☰ Motif
          </button>
          <button className={`mpb ${mobilePanel==='props'?'mpb--active':''}`}
            onClick={() => setMobilePanel(p => p==='props' ? null : 'props')}>
            ⚙ Properti
          </button>
        </div>

        <Toolbar
          stageRef={stageRef}
          canvasItems={canvasItems}
          canvasSize={canvasSize}
          setCanvasSize={setCanvasSize}
          zoom={zoom} setZoom={setZoom}
          bgColor={bgColor} setBgColor={setBgColor}
          bgTransparent={bgTransparent} setBgTransparent={setBgTransparent}
          onClear={clearCanvas}
          cropMode={cropMode} setCropMode={setCropMode}
          selectedId={selectedId}
          onUndo={undo} onRedo={redo}
          canUndo={canUndo} canRedo={canRedo}
          onDeselectForExport={onDeselectForExport}
          onAfterExport={onAfterExport}
          // Desktop panel collapse toggles
          sidebarCollapsed={sidebarCollapsed} onToggleSidebar={() => setSidebarCollapsed(c => !c)}
          propsCollapsed={propsCollapsed}     onToggleProps={() => setPropsCollapsed(c => !c)}
        />
      </header>

      <div className="app-body">
        {/* LEFT SIDEBAR */}
        <div
          className={`panel-sidebar ${sidebarCollapsed ? 'panel--collapsed' : ''}`}
          style={{ width: effectiveSidebarW }}
        >
          {!sidebarCollapsed && (
            <Sidebar motifs={motifs} setMotifs={setMotifs} onAddMotif={addMotif} />
          )}
          <div className="resize-handle resize-handle--right" onMouseDown={dragSidebar}>
            <div className="resize-handle__inner" />
          </div>
        </div>

        {/* CANVAS */}
        <main className="canvas-area">
          <Canvas
            stageRef={stageRef}
            items={canvasItems}
            setItems={setCanvasItems}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            grid={grid}
            canvasSize={canvasSize}
            zoom={zoom} setZoom={setZoom}
            bgColor={bgColor}
            bgTransparent={bgTransparent}
            onUpdateItem={updateItem}
            onDeleteItem={deleteItem}
            cropMode={cropMode}
            setCropMode={setCropMode}
          />
        </main>

        {/* RIGHT PROPERTIES PANEL */}
        <div
          className={`panel-props ${propsCollapsed ? 'panel--collapsed' : ''}`}
          style={{ width: effectivePropsW }}
        >
          <div className="resize-handle resize-handle--left" onMouseDown={dragProps}>
            <div className="resize-handle__inner" />
          </div>
          {!propsCollapsed && (
            <PropertiesPanel
              selectedItem={selectedItem}
              onUpdate={updateItem}
              onDelete={deleteItem}
              onDuplicate={duplicateItem}
              onBringForward={bringForward}
              onSendBackward={sendBackward}
              grid={grid} setGrid={setGrid}
              cropMode={cropMode} setCropMode={setCropMode}
            />
          )}
        </div>
      </div>

      {/* MOBILE BOTTOM SHEET */}
      {mobilePanel && (
        <div className="mobile-sheet">
          <div className="mobile-sheet__backdrop" onClick={() => setMobilePanel(null)} />
          <div className="mobile-sheet__panel">
            <div className="mobile-sheet__bar">
              <div className="mobile-sheet__pill" />
              <button className="mobile-sheet__close" onClick={() => setMobilePanel(null)}>×</button>
            </div>
            {mobilePanel === 'sidebar' && (
              <Sidebar motifs={motifs} setMotifs={setMotifs} onAddMotif={addMotif} />
            )}
            {mobilePanel === 'props' && (
              <PropertiesPanel
                selectedItem={selectedItem}
                onUpdate={updateItem}
                onDelete={deleteItem}
                onDuplicate={duplicateItem}
                onBringForward={bringForward}
                onSendBackward={sendBackward}
                grid={grid} setGrid={setGrid}
                cropMode={cropMode} setCropMode={setCropMode}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
