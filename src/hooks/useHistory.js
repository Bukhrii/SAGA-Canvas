import { useState, useCallback, useRef } from 'react'

const MAX = 60

export function useHistory(initial) {
  // store history as a flat array in a ref to avoid stale closures
  const histRef = useRef([initial])
  const [cursor, setCursor] = useState(0)

  // Reading current state straight from ref+cursor (no derived state)
  const state = histRef.current[cursor]

  const setState = useCallback((updaterOrValue, { skipHistory = false } = {}) => {
    setCursor(prev => {
      const cur = histRef.current[prev]
      const next = typeof updaterOrValue === 'function' ? updaterOrValue(cur) : updaterOrValue

      if (skipHistory) {
        // mutate in place — no new history entry
        histRef.current[prev] = next
        return prev // same index forces re-render because setCursor triggers reconciliation
      }

      // truncate forward history, push new snapshot
      const newHist = histRef.current.slice(0, prev + 1)
      newHist.push(next)
      if (newHist.length > MAX) newHist.shift()
      histRef.current = newHist
      return newHist.length - 1
    })
  }, [])

  const undo = useCallback(() => setCursor(c => Math.max(0, c - 1)), [])
  const redo = useCallback(() => setCursor(c => Math.min(histRef.current.length - 1, c + 1)), [])

  return {
    state,
    setState,
    undo,
    redo,
    get canUndo() { return cursor > 0 },
    get canRedo() { return cursor < histRef.current.length - 1 },
    cursor, // expose for debugging
  }
}
