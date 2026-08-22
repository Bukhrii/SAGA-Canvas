import React, { useState, useCallback } from 'react'
import './PropertiesPanel.css'

function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="pp-section">
      <button className="pp-section-header" onClick={() => setOpen(o => !o)}>
        <span>{title}</span>
        <span className="pp-chevron">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="pp-section-body">{children}</div>}
    </div>
  )
}

function FieldRow({ label, tooltip, children }) {
  return (
    <div className="pp-field">
      <label className="pp-field-label">
        {label}
        {tooltip && <span className="pp-tip" title={tooltip}>?</span>}
      </label>
      <div className="pp-field-input">{children}</div>
    </div>
  )
}

function NumberInput({ value, onChange, min, max, step = 1, unit = '' }) {
  return (
    <div className="pp-number-wrap">
      <input
        type="number"
        value={Math.round(value * 10) / 10}
        onChange={e => onChange(parseFloat(e.target.value))}
        min={min} max={max} step={step}
        className="pp-number"
      />
      {unit && <span className="pp-unit">{unit}</span>}
    </div>
  )
}

export default function PropertiesPanel({
  selectedItem, onUpdate, onDelete, onDuplicate,
  onBringForward, onSendBackward, grid, setGrid,
  cropMode, setCropMode,
}) {
  const update = useCallback((key, val) => {
    if (selectedItem) onUpdate(selectedItem.id, { [key]: val })
  }, [selectedItem, onUpdate])

  return (
    <aside className="props-panel">
      <div className="pp-header">
        <span className="pp-title">Properti</span>
        {selectedItem && <span className="pp-selected">{selectedItem.name}</span>}
      </div>

      <div className="pp-scroll">

        {/* ── Item properties ─────────────────────── */}
        {selectedItem ? (
          <>
            <Section title="Aksi">
              <div className="action-grid">
                <button className="pp-action-btn" onClick={() => onDuplicate(selectedItem.id)}
                  title="Buat salinan motif ini di canvas">⊕ Duplikat</button>
                <button className={`pp-action-btn ${cropMode?'pp-action-btn--teal':''}`}
                  onClick={() => setCropMode(c => !c)}
                  title="Potong area motif — pilih bagian yang ingin ditampilkan">
                  ✂ {cropMode ? 'Keluar Crop' : 'Crop'}
                </button>
              </div>

              <div className="layer-group">
                <div className="layer-title">
                  Urutan Lapisan
                  <span className="pp-tip"
                    title="Canvas memiliki lapisan (layer). Motif yang ditambahkan belakangan berada di atas. Klik Maju untuk memindahkan motif ke lapisan atas (tampil di depan), Mundur ke lapisan bawah (tampil di belakang motif lain).">?</span>
                </div>
                <div className="layer-btns">
                  <button className="pp-action-btn"
                    onClick={() => onBringForward(selectedItem.id)}
                    title="Pindahkan satu lapisan ke atas — motif tampil di depan motif lain">
                    ↑ Maju (ke depan)
                  </button>
                  <button className="pp-action-btn"
                    onClick={() => onSendBackward(selectedItem.id)}
                    title="Pindahkan satu lapisan ke bawah — motif tampil di belakang motif lain">
                    ↓ Mundur (ke belakang)
                  </button>
                </div>
              </div>

              <button className="pp-action-btn pp-action-btn--danger" style={{width:'100%',marginTop:4}}
                onClick={() => onDelete(selectedItem.id)}>
                ✕ Hapus dari Canvas
              </button>
            </Section>

            <Section title="Posisi & Ukuran">
              <FieldRow label="X"><NumberInput value={selectedItem.x} onChange={v=>update('x',v)} unit="px" /></FieldRow>
              <FieldRow label="Y"><NumberInput value={selectedItem.y} onChange={v=>update('y',v)} unit="px" /></FieldRow>
              <FieldRow label="Lebar"><NumberInput value={selectedItem.width}  onChange={v=>update('width',  Math.max(10,v))} min={10} unit="px" /></FieldRow>
              <FieldRow label="Tinggi"><NumberInput value={selectedItem.height} onChange={v=>update('height', Math.max(10,v))} min={10} unit="px" /></FieldRow>
              <FieldRow label="Rotasi"><NumberInput value={selectedItem.rotation} onChange={v=>update('rotation',v)} min={-360} max={360} unit="°" /></FieldRow>
              <div className="pp-rotate-btns">
                <button className="pp-rotate-btn" onClick={()=>update('rotation',(selectedItem.rotation-90+360)%360)}>↺ −90°</button>
                <button className="pp-rotate-btn" onClick={()=>update('rotation',0)}>○ Reset</button>
                <button className="pp-rotate-btn" onClick={()=>update('rotation',(selectedItem.rotation+90)%360)}>↻ +90°</button>
              </div>
            </Section>

            <Section title="Tampilan">
              <FieldRow label="Opacity">
                <input type="range" min={0} max={1} step={0.01}
                  value={selectedItem.opacity ?? 1}
                  onChange={e => update('opacity', parseFloat(e.target.value))}
                  className="pp-slider" />
                <span className="pp-slider-val">{Math.round((selectedItem.opacity??1)*100)}%</span>
              </FieldRow>
              <div className="flip-row">
                <button className={`flip-btn ${selectedItem.flipX?'flip-btn--active':''}`}
                  onClick={()=>update('flipX',!selectedItem.flipX)}>↔ Flip H</button>
                <button className={`flip-btn ${selectedItem.flipY?'flip-btn--active':''}`}
                  onClick={()=>update('flipY',!selectedItem.flipY)}>↕ Flip V</button>
              </div>
            </Section>
          </>
        ) : (
          <div className="pp-empty">
            <div className="pp-empty-icon">✦</div>
            <p>Klik motif di canvas untuk mengedit propertinya</p>
          </div>
        )}

        {/* ── Grid (always visible) ────────────────── */}
        <Section title="Grid Kanvas" defaultOpen={true}>
          <FieldRow label="Tampilkan">
            <label className="pp-toggle">
              <input type="checkbox" checked={grid.enabled}
                onChange={e => setGrid(g=>({...g,enabled:e.target.checked}))} />
              <span className="pp-toggle-track" />
            </label>
          </FieldRow>

          <FieldRow label="Tipe"
            tooltip="Square = grid persegi seperti kertas kotak-kotak. Diamond = grid belah ketupat khas motif sasirangan.">
            <select className="pp-select" value={grid.type}
              onChange={e => setGrid(g=>({...g,type:e.target.value}))}>
              <option value="none">Tidak Ada</option>
              <option value="square">Persegi (Square)</option>
              <option value="diamond">Belah Ketupat (Diamond)</option>
            </select>
          </FieldRow>

          <FieldRow label={`Ukuran: ${grid.size}px`}
            tooltip="Jarak antar garis grid dalam pixel. Perbesar untuk sasirangan yang lebih jarang, perkecil untuk pola rapat.">
            <input type="range" min={10} max={500} step={5}
              value={grid.size}
              onChange={e => setGrid(g=>({...g,size:parseInt(e.target.value)}))}
              className="pp-slider" />
            <span className="pp-slider-val">{grid.size}</span>
          </FieldRow>

          <FieldRow label="Opacity">
            <input type="range" min={0.05} max={1} step={0.05}
              value={grid.opacity}
              onChange={e => setGrid(g=>({...g,opacity:parseFloat(e.target.value)}))}
              className="pp-slider" />
            <span className="pp-slider-val">{Math.round(grid.opacity*100)}%</span>
          </FieldRow>

          <FieldRow label="Warna">
            <input type="color" className="pp-color" value={grid.color}
              onChange={e => setGrid(g=>({...g,color:e.target.value}))} />
            <span className="pp-unit" style={{fontFamily:'monospace',fontSize:10}}>{grid.color}</span>
          </FieldRow>
        </Section>

        <div className="pp-footer">
          <p>Saga Canvas v1.0</p>
          <p className="pp-footer-brand">Kalimantan Selatan ✦</p>
        </div>
      </div>
    </aside>
  )
}
