import React, { useRef, useState, useCallback, useEffect } from 'react'
import './Sidebar.css'

export default function Sidebar({ motifs, setMotifs, onAddMotif }) {
  const fileInputRef = useRef(null)
  const [dragOver, setDragOver]   = useState(false)
  const [search, setSearch]       = useState('')
  const [loadingBuiltin, setLoadingBuiltin] = useState(true)

  // ── Load built-in motifs from public/motifs/ via manifest ────────────────
  useEffect(() => {
    fetch('./motif-manifest.json')
      .then(r => r.ok ? r.json() : [])
      .then(list => {
        if (!Array.isArray(list) || list.length === 0) { setLoadingBuiltin(false); return }
        const builtins = list.map(m => ({
          id:        `builtin_${m.file}`,
          name:      m.name,
          src:       m.file,
          isBuiltin: true,
        }))
        setMotifs(prev => {
          // only add ones not already present
          const existingIds = new Set(prev.map(p => p.id))
          const fresh = builtins.filter(b => !existingIds.has(b.id))
          return [...prev, ...fresh]
        })
        setLoadingBuiltin(false)
      })
      .catch(() => setLoadingBuiltin(false))
  }, [])

  // ── File upload ───────────────────────────────────────────────────────────
  const handleFiles = useCallback((files) => {
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return
      const reader = new FileReader()
      reader.onload = e => {
        setMotifs(prev => [...prev, {
          id:       `upload_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
          name:     file.name.replace(/\.[^/.]+$/, ''),
          src:      e.target.result,
          isCustom: true,
        }])
      }
      reader.readAsDataURL(file)
    })
  }, [setMotifs])

  const handleDrop = useCallback(e => {
    e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  const removeMotif = useCallback(id => {
    setMotifs(prev => prev.filter(m => m.id !== id))
  }, [setMotifs])

  const filtered = motifs.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase())
  )

  const builtinCount = motifs.filter(m => m.isBuiltin).length
  const uploadCount  = motifs.filter(m => !m.isBuiltin).length

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2 className="sidebar-title">Motif</h2>
        <span className="sidebar-count">{motifs.length}</span>
      </div>

      <div className="sidebar-search">
        <input type="text" placeholder="Cari motif..." value={search}
          onChange={e => setSearch(e.target.value)} className="search-input" />
      </div>

      {/* Upload zone */}
      <div
        className={`drop-zone ${dragOver ? 'drop-zone--active' : ''}`}
        onDrop={handleDrop}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="drop-icon">⊕</div>
        <p className="drop-text">Upload motif</p>
        <p className="drop-sub">PNG transparan · seret atau klik</p>
        <input ref={fileInputRef} type="file" accept="image/*" multiple
          style={{ display:'none' }}
          onChange={e => handleFiles(e.target.files)} />
      </div>

      {/* Stats */}
      {(builtinCount > 0 || uploadCount > 0) && (
        <div className="sidebar-stats">
          {builtinCount > 0 && <span className="stat-chip stat-chip--builtin">● {builtinCount} bawaan</span>}
          {uploadCount  > 0 && <span className="stat-chip stat-chip--upload">+ {uploadCount} diunggah</span>}
        </div>
      )}

      {/* Empty state */}
      {motifs.length === 0 && !loadingBuiltin && (
        <div className="sidebar-empty">
          <p className="empty-text">Belum ada motif</p>
          <p className="empty-sub">
            Letakkan file PNG motif di folder:<br/>
            <code className="empty-path">saga-canvas/public/motifs/</code><br/>
            lalu jalankan ulang <code>npm run dev</code>,<br/>
            atau upload langsung di sini.
          </p>
        </div>
      )}

      {loadingBuiltin && (
        <div className="sidebar-empty">
          <p className="empty-text">Memuat motif...</p>
        </div>
      )}

      {/* Grid */}
      <div className="motif-grid">
        {filtered.map(motif => (
          <MotifCard key={motif.id} motif={motif}
            onAdd={() => onAddMotif(motif)}
            onRemove={motif.isBuiltin ? null : () => removeMotif(motif.id)}
          />
        ))}
      </div>
    </aside>
  )
}

function MotifCard({ motif, onAdd, onRemove }) {
  const [hover, setHover] = useState(false)

  return (
    <div
      className={`motif-card ${hover ? 'motif-card--hover' : ''}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onDoubleClick={onAdd}
      title={`${motif.name}${motif.isBuiltin ? ' (bawaan)' : ''} — klik dua kali untuk tambah`}
    >
      <div className="motif-preview">
        <img src={motif.src} alt={motif.name} loading="lazy" crossOrigin="anonymous" />
        {hover && (
          <div className="motif-overlay">
            <button className="motif-btn motif-btn--add" onClick={e => { e.stopPropagation(); onAdd() }}>+</button>
            {onRemove && (
              <button className="motif-btn motif-btn--remove" onClick={e => { e.stopPropagation(); onRemove() }}>×</button>
            )}
          </div>
        )}
      </div>
      <p className="motif-name">{motif.name}</p>
    </div>
  )
}
