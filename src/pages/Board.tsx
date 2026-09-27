import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { Link } from 'react-router-dom'
import { Footer, Shell3, WhatIveDone, type ToolName } from '../components/Shell'

type ItemType = 'sticky' | 'frame' | 'arrow' | 'source' | 'table' | 'golden' | 'kpi'

type SourceView = 'chip' | 'apercu'

type BoardItem = {
  id: string
  type: ItemType
  x: number
  y: number
  w: number
  h: number
  text: string
  /** Mini-table mock grid (header row + data rows). Used by table / source / golden aperçu. */
  cells?: string[][]
  /** Source & Golden display mode: compact chip or mini-table aperçu. */
  view?: SourceView
  /** KPI big measure value. */
  measure?: string
  /** KPI sparkline / mini-bar series (0–100-ish). */
  spark?: number[]
  /** KPI chart style. */
  chartKind?: 'spark' | 'bars'
}

type Connector = {
  id: string
  type: 'connector'
  fromId: string
  toId: string
}

const GRID = 8
const CHIP_H = 36
const APERCU_W = 340
const APERCU_H = 176
const GOLDEN_APERCU_W = 360
const GOLDEN_APERCU_H = 184
const KPI_W = 168
const KPI_H = 128
const ZOOM_MIN = 0.25
const ZOOM_MAX = 2
const ZOOM_STEP = 0.1

function clampZoom(z: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100))
}

const TOURNEES_CELLS: string[][] = [
  ['ID_tournée', 'Date', 'Zone', 'Km', 'Coût (€)'],
  ['TRN001', '02/05/2024', 'Nord', '142', '186,4'],
  ['TRN002', '02/05/2024', 'Sud', '98', '112,0'],
  ['TRN003', '03/05/2024', 'Est', '210', '268,5'],
  ['TRN004', '03/05/2024', 'Ouest', '156', '198,2'],
  ['TRN005', '04/05/2024', 'Nord', '87', '94,5'],
]

const COUTS_CELLS: string[][] = [
  ['ID_coût', 'Véhicule', 'Type', 'Montant', 'Budget'],
  ['CST001', 'VU-23', 'Carburant', '420,5 €', '400 €'],
  ['CST002', 'VU-07', 'Carburant', '310,0 €', '320 €'],
  ['CST003', 'VU-12', 'Entretien', '180,0 €', '200 €'],
  ['CST004', 'VU-15', 'Carburant', '355,2 €', '340 €'],
  ['CST005', 'VU-23', 'Péage', '95,0 €', '80 €'],
]

/** Clean joined dataset — Golden aperçu. */
const GOLDEN_CELLS: string[][] = [
  ['ID', 'Zone', 'Km', 'Coût', '€/km'],
  ['TRN001', 'Nord', '142', '186,4', '1,31'],
  ['TRN002', 'Sud', '98', '112,0', '1,14'],
  ['TRN003', 'Est', '210', '268,5', '1,28'],
  ['TRN004', 'Ouest', '156', '198,2', '1,27'],
  ['TRN005', 'Nord', '87', '94,5', '1,09'],
]

const EMPTY_TABLE_CELLS: string[][] = [
  ['A', 'B', 'C', 'D', 'E'],
  ['—', '—', '—', '—', '—'],
  ['—', '—', '—', '—', '—'],
  ['—', '—', '—', '—', '—'],
  ['—', '—', '—', '—', '—'],
]

function chipWidth(text: string) {
  return Math.max(112, Math.min(240, 44 + text.length * 7.5))
}

function sourceDims(view: SourceView, text: string) {
  if (view === 'apercu') return { w: APERCU_W, h: APERCU_H }
  return { w: chipWidth(text), h: CHIP_H }
}

function goldenDims(view: SourceView, text: string) {
  if (view === 'apercu') return { w: GOLDEN_APERCU_W, h: GOLDEN_APERCU_H }
  const label = text.startsWith('Golden') ? text : `Golden · ${text}`
  return { w: chipWidth(label), h: CHIP_H }
}

function goldenChipLabel(text: string) {
  return text.startsWith('Golden') ? text : `Golden · ${text}`
}

function Sparkline({ values, kind = 'spark' }: { values: number[]; kind?: 'spark' | 'bars' }) {
  const w = 140
  const h = 36
  const pad = 2
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = max - min || 1
  const n = values.length

  if (kind === 'bars') {
    const gap = 2
    const barW = Math.max(3, (w - pad * 2 - gap * (n - 1)) / n)
    return (
      <svg className="board-kpi-chart" viewBox={`0 0 ${w} ${h}`} width="100%" height={h} aria-hidden>
        {values.map((v, i) => {
          const bh = ((v - min) / range) * (h - pad * 2)
          const x = pad + i * (barW + gap)
          const y = h - pad - bh
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={barW}
              height={Math.max(1.5, bh)}
              rx={1}
              fill="currentColor"
              opacity={0.55 + (i / n) * 0.35}
            />
          )
        })}
      </svg>
    )
  }

  const pts = values.map((v, i) => {
    const x = pad + (i / Math.max(1, n - 1)) * (w - pad * 2)
    const y = h - pad - ((v - min) / range) * (h - pad * 2)
    return `${x},${y}`
  })
  const area = `${pad},${h - pad} ${pts.join(' ')} ${w - pad},${h - pad}`
  return (
    <svg className="board-kpi-chart" viewBox={`0 0 ${w} ${h}`} width="100%" height={h} aria-hidden>
      <polygon points={area} fill="currentColor" opacity={0.12} />
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

const initialItems: BoardItem[] = [
  {
    id: 'src1',
    type: 'source',
    x: 40,
    y: 40,
    ...sourceDims('chip', 'tournées.csv'),
    text: 'tournées.csv',
    view: 'chip',
    cells: TOURNEES_CELLS,
  },
  {
    id: 'src2',
    type: 'source',
    x: 40,
    y: 100,
    ...sourceDims('apercu', 'coûts.csv'),
    text: 'coûts.csv',
    view: 'apercu',
    cells: COUTS_CELLS,
  },
  {
    id: 'g1',
    type: 'golden',
    x: 440,
    y: 80,
    ...goldenDims('chip', 'last-mile'),
    text: 'last-mile',
    view: 'chip',
    cells: GOLDEN_CELLS,
  },
  {
    id: 'k1',
    type: 'kpi',
    x: 720,
    y: 40,
    w: KPI_W,
    h: KPI_H,
    text: 'Coût / km',
    measure: '1,24 €',
    spark: [18, 22, 19, 28, 24, 31, 27, 35, 30, 33],
    chartKind: 'spark',
  },
  {
    id: 'k2',
    type: 'kpi',
    x: 920,
    y: 40,
    w: KPI_W,
    h: KPI_H,
    text: 'Écart vs cible',
    measure: '+8,2 %',
    spark: [12, 18, 15, 22, 28, 25, 32, 30, 38, 35],
    chartKind: 'bars',
  },
  {
    id: 'k3',
    type: 'kpi',
    x: 820,
    y: 200,
    w: KPI_W,
    h: KPI_H,
    text: 'Tournées critiques',
    measure: '3',
    spark: [5, 4, 6, 3, 4, 2, 5, 3, 4, 3],
    chartKind: 'spark',
  },
  { id: 's1', type: 'sticky', x: 40, y: 320, w: 140, h: 90, text: 'Hypothèse coût zone' },
  { id: 's2', type: 'sticky', x: 220, y: 340, w: 140, h: 90, text: 'Jointure OK — vérifier Est' },
]

const initialConnectors: Connector[] = [
  { id: 'c1', type: 'connector', fromId: 'src1', toId: 'g1' },
  { id: 'c2', type: 'connector', fromId: 'src2', toId: 'g1' },
  { id: 'c3', type: 'connector', fromId: 'g1', toId: 'k1' },
  { id: 'c4', type: 'connector', fromId: 'g1', toId: 'k2' },
  { id: 'c5', type: 'connector', fromId: 'g1', toId: 'k3' },
]

const defaultTimeline = [
  { t: '14:02', a: 'Start draft' },
  { t: '14:05', a: 'Import data' },
  { t: '14:08', a: 'Open Board' },
  { t: '14:12', a: 'Data transformation' },
  { t: '14:20', a: 'Exploration' },
]

let nextId = 20

function snap(v: number, disable: boolean) {
  if (disable) return v
  return Math.round(v / GRID) * GRID
}

function rectsIntersect(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

function itemCenter(it: BoardItem) {
  return { x: it.x + it.w / 2, y: it.y + it.h / 2 }
}

/** Edge midpoint facing toward the other item. */
function edgePoint(from: BoardItem, to: BoardItem) {
  const fc = itemCenter(from)
  const tc = itemCenter(to)
  const dx = tc.x - fc.x
  const dy = tc.y - fc.y
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0
      ? { x: from.x + from.w, y: fc.y }
      : { x: from.x, y: fc.y }
  }
  return dy > 0
    ? { x: fc.x, y: from.y + from.h }
    : { x: fc.x, y: from.y }
}

function canvasPoint(el: HTMLDivElement, clientX: number, clientY: number, zoom: number) {
  const rect = el.getBoundingClientRect()
  return {
    x: (clientX - rect.left + el.scrollLeft) / zoom,
    y: (clientY - rect.top + el.scrollTop) / zoom,
  }
}

function isEditableType(type: ItemType) {
  return (
    type === 'sticky' ||
    type === 'frame' ||
    type === 'source' ||
    type === 'table' ||
    type === 'golden' ||
    type === 'kpi'
  )
}

function isToggleable(type: ItemType) {
  return type === 'source' || type === 'golden'
}

export default function Board() {
  const [tool, setTool] = useState<ToolName>('Select')
  const [items, setItems] = useState<BoardItem[]>(initialItems)
  const [connectors, setConnectors] = useState<Connector[]>(initialConnectors)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [log, setLog] = useState(defaultTimeline)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [connectorDraft, setConnectorDraft] = useState<string | null>(null)
  const [spaceDown, setSpaceDown] = useState(false)
  const [zoom, setZoom] = useState(1)

  const dragRef = useRef<{
    mode: 'move' | 'marquee' | 'pan'
    startX: number
    startY: number
    origScrollLeft: number
    origScrollTop: number
    origins: Record<string, { x: number; y: number }>
    moved: boolean
    count: number
  } | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const pendingScrollRef = useRef<{ left: number; top: number } | null>(null)
  const editRef = useRef<HTMLDivElement>(null)
  const clickToggleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const itemsRef = useRef(items)
  itemsRef.current = items
  const selectedRef = useRef(selectedIds)
  selectedRef.current = selectedIds
  const marqueeRef = useRef(marquee)
  marqueeRef.current = marquee

  const pushLog = useCallback((a: string) => {
    const now = new Date()
    const t = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    setLog((prev) => [{ t, a }, ...prev].slice(0, 12))
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const editing = editingId != null || (e.target as HTMLElement)?.isContentEditable
      if (e.code === 'Space' && !editing) {
        e.preventDefault()
        setSpaceDown(true)
        return
      }
      if (editing) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        const ids = selectedRef.current
        if (!ids.length) return
        const idSet = new Set(ids)
        setItems((prev) => prev.filter((it) => !idSet.has(it.id)))
        setConnectors((prev) =>
          prev.filter((c) => !idSet.has(c.id) && !idSet.has(c.fromId) && !idSet.has(c.toId)),
        )
        setSelectedIds([])
        setConnectorDraft(null)
        pushLog(ids.length === 1 ? 'Deleted 1 item' : `Deleted ${ids.length} items`)
      }
      if (e.key === 'Escape') {
        setSelectedIds([])
        setConnectorDraft(null)
        setEditingId(null)
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceDown(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [editingId, pushLog])

  useEffect(() => {
    if (editingId && editRef.current) {
      editRef.current.focus()
      const range = document.createRange()
      range.selectNodeContents(editRef.current)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    }
  }, [editingId])

  const commitEdit = useCallback(() => {
    if (!editingId || !editRef.current) {
      setEditingId(null)
      return
    }
    const text = (editRef.current.textContent ?? '').trim() || '…'
    const id = editingId
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it
        if (it.type === 'source' && it.view !== 'apercu') {
          const dims = sourceDims('chip', text)
          return { ...it, text, w: dims.w, h: dims.h }
        }
        if (it.type === 'golden' && it.view !== 'apercu') {
          const dims = goldenDims('chip', text)
          return { ...it, text, w: dims.w, h: dims.h }
        }
        return { ...it, text }
      }),
    )
    setEditingId(null)
    pushLog(`Edited “${text.slice(0, 28)}”`)
  }, [editingId, pushLog])

  const applyZoomAt = useCallback((next: number, clientX?: number, clientY?: number) => {
    const canvas = canvasRef.current
    const oldZ = zoomRef.current
    const newZ = clampZoom(next)
    if (!canvas || newZ === oldZ) {
      if (newZ !== oldZ) {
        zoomRef.current = newZ
        setZoom(newZ)
      }
      return
    }
    const rect = canvas.getBoundingClientRect()
    const mx = clientX != null ? clientX - rect.left : rect.width / 2
    const my = clientY != null ? clientY - rect.top : rect.height / 2
    const worldX = (mx + canvas.scrollLeft) / oldZ
    const worldY = (my + canvas.scrollTop) / oldZ
    zoomRef.current = newZ
    setZoom(newZ)
    pendingScrollRef.current = {
      left: worldX * newZ - mx,
      top: worldY * newZ - my,
    }
  }, [])

  useLayoutEffect(() => {
    const pending = pendingScrollRef.current
    const canvas = canvasRef.current
    if (!pending || !canvas) return
    pendingScrollRef.current = null
    canvas.scrollLeft = pending.left
    canvas.scrollTop = pending.top
  }, [zoom])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      const oldZ = zoomRef.current
      const direction = e.deltaY < 0 ? 1 : -1
      const factor = direction > 0 ? 1.1 : 1 / 1.1
      applyZoomAt(oldZ * factor, e.clientX, e.clientY)
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [applyZoomAt])

  const zoomBy = (delta: number) => {
    const canvas = canvasRef.current
    if (!canvas) {
      applyZoomAt(zoomRef.current + delta)
      return
    }
    const rect = canvas.getBoundingClientRect()
    applyZoomAt(zoomRef.current + delta, rect.left + rect.width / 2, rect.top + rect.height / 2)
  }

  const zoomTo100 = () => {
    const canvas = canvasRef.current
    if (!canvas) {
      applyZoomAt(1)
      return
    }
    const rect = canvas.getBoundingClientRect()
    applyZoomAt(1, rect.left + rect.width / 2, rect.top + rect.height / 2)
  }

  const zoomToFit = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const pad = 48
    const cw = Math.max(1200, ...itemsRef.current.map((i) => i.x + i.w + 200))
    const ch = Math.max(800, ...itemsRef.current.map((i) => i.y + i.h + 200))
    const zx = (canvas.clientWidth - pad * 2) / cw
    const zy = (canvas.clientHeight - pad * 2) / ch
    const newZ = clampZoom(Math.min(zx, zy))
    zoomRef.current = newZ
    setZoom(newZ)
    pendingScrollRef.current = {
      left: Math.max(0, (cw * newZ - canvas.clientWidth) / 2),
      top: Math.max(0, (ch * newZ - canvas.clientHeight) / 2),
    }
  }

  const onPointerDownItem = (e: ReactPointerEvent, item: BoardItem) => {
    if (spaceDown || e.button === 1) return
    e.stopPropagation()
    if (clickToggleTimer.current) {
      clearTimeout(clickToggleTimer.current)
      clickToggleTimer.current = null
    }

    if (tool === 'Arrow') {
      e.preventDefault()
      if (!connectorDraft) {
        setConnectorDraft(item.id)
        setSelectedIds([item.id])
        return
      }
      if (connectorDraft === item.id) return
      const id = `c${nextId++}`
      setConnectors((prev) => [...prev, { id, type: 'connector', fromId: connectorDraft, toId: item.id }])
      setConnectorDraft(null)
      setSelectedIds([id])
      setTool('Select')
      pushLog('Created connector')
      return
    }

    if (editingId) return

    const shift = e.shiftKey
    let nextSelected = selectedIds
    if (shift) {
      nextSelected = selectedIds.includes(item.id)
        ? selectedIds.filter((id) => id !== item.id)
        : [...selectedIds, item.id]
      setSelectedIds(nextSelected)
    } else if (!selectedIds.includes(item.id)) {
      nextSelected = [item.id]
      setSelectedIds(nextSelected)
    }

    if (tool !== 'Select') return

    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const moveIds = nextSelected.filter((id) => items.some((it) => it.id === id))
    const origins: Record<string, { x: number; y: number }> = {}
    for (const it of items) {
      if (moveIds.includes(it.id)) origins[it.id] = { x: it.x, y: it.y }
    }
    dragRef.current = {
      mode: 'move',
      startX: e.clientX,
      startY: e.clientY,
      origScrollLeft: 0,
      origScrollTop: 0,
      origins,
      moved: false,
      count: Object.keys(origins).length,
    }
  }

  const onPointerDownConnector = (e: ReactPointerEvent, id: string) => {
    if (spaceDown || e.button === 1) return
    e.stopPropagation()
    if (tool === 'Arrow') return
    if (e.shiftKey) {
      setSelectedIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
      )
    } else {
      setSelectedIds([id])
    }
  }

  const onPointerMove = (e: ReactPointerEvent) => {
    const d = dragRef.current
    if (!d) return
    const canvas = canvasRef.current
    if (!canvas) return

    if (d.mode === 'pan') {
      canvas.scrollLeft = d.origScrollLeft - (e.clientX - d.startX)
      canvas.scrollTop = d.origScrollTop - (e.clientY - d.startY)
      d.moved = true
      return
    }

    if (d.mode === 'marquee') {
      const p = canvasPoint(canvas, e.clientX, e.clientY, zoomRef.current)
      const ox = d.origins.__mq.x
      const oy = d.origins.__mq.y
      setMarquee({
        x: Math.min(ox, p.x),
        y: Math.min(oy, p.y),
        w: Math.abs(p.x - ox),
        h: Math.abs(p.y - oy),
      })
      d.moved = true
      return
    }

    const z = zoomRef.current || 1
    const dx = (e.clientX - d.startX) / z
    const dy = (e.clientY - d.startY) / z
    if (Math.abs(e.clientX - d.startX) > 2 || Math.abs(e.clientY - d.startY) > 2) d.moved = true
    const disableSnap = e.altKey
    setItems((prev) =>
      prev.map((it) => {
        const o = d.origins[it.id]
        if (!o) return it
        return {
          ...it,
          x: snap(o.x + dx, disableSnap),
          y: snap(o.y + dy, disableSnap),
        }
      }),
    )
  }

  const onPointerUp = (e: ReactPointerEvent) => {
    const d = dragRef.current
    if (!d) return
    const canvas = canvasRef.current

    if (d.mode === 'marquee' && canvas) {
      const box =
        marqueeRef.current ??
        (() => {
          const p = canvasPoint(canvas, e.clientX, e.clientY, zoomRef.current)
          const ox = d.origins.__mq.x
          const oy = d.origins.__mq.y
          return {
            x: Math.min(ox, p.x),
            y: Math.min(oy, p.y),
            w: Math.abs(p.x - ox),
            h: Math.abs(p.y - oy),
          }
        })()
      if (box.w > 3 || box.h > 3) {
        const hit = itemsRef.current
          .filter((it) => rectsIntersect(box, { x: it.x, y: it.y, w: it.w, h: it.h }))
          .map((it) => it.id)
        setSelectedIds(hit)
      } else {
        setSelectedIds([])
      }
      setMarquee(null)
    } else if (d.mode === 'move' && d.moved) {
      pushLog(d.count === 1 ? 'Moved 1 item' : `Moved ${d.count} items`)
    } else if (d.mode === 'move' && !d.moved) {
      // Click without drag: toggle source/golden chip ↔ aperçu
      const ids = Object.keys(d.origins)
      if (ids.length === 1) {
        const id = ids[0]
        if (clickToggleTimer.current) clearTimeout(clickToggleTimer.current)
        clickToggleTimer.current = setTimeout(() => {
          clickToggleTimer.current = null
          const it = itemsRef.current.find((i) => i.id === id)
          if (!it || !isToggleable(it.type)) return
          const nextView: SourceView = it.view === 'apercu' ? 'chip' : 'apercu'
          const dims =
            it.type === 'golden'
              ? goldenDims(nextView, it.text)
              : sourceDims(nextView, it.text)
          setItems((prev) =>
            prev.map((row) =>
              row.id === it.id ? { ...row, view: nextView, w: dims.w, h: dims.h } : row,
            ),
          )
          pushLog(
            nextView === 'apercu'
              ? `Aperçu « ${it.text} »`
              : `Chip « ${it.text} »`,
          )
        }, 220)
      }
    }

    dragRef.current = null
  }

  const onCanvasPointerDown = (e: ReactPointerEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return

    if (spaceDown || e.button === 1) {
      e.preventDefault()
      canvas.setPointerCapture(e.pointerId)
      dragRef.current = {
        mode: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        origScrollLeft: canvas.scrollLeft,
        origScrollTop: canvas.scrollTop,
        origins: {},
        moved: false,
        count: 0,
      }
      return
    }

    const target = e.target as HTMLElement
    if (
      e.target !== canvas &&
      !target.classList?.contains('board-connectors') &&
      !target.classList?.contains('board-world')
    ) {
      return
    }

    const p = canvasPoint(canvas, e.clientX, e.clientY, zoomRef.current)

    if (
      tool === 'Sticky' ||
      tool === 'Frame' ||
      tool === 'Table' ||
      tool === 'Source' ||
      tool === 'Golden' ||
      tool === 'KPI'
    ) {
      const type: ItemType =
        tool === 'Sticky'
          ? 'sticky'
          : tool === 'Frame'
            ? 'frame'
            : tool === 'Table'
              ? 'table'
              : tool === 'Source'
                ? 'source'
                : tool === 'Golden'
                  ? 'golden'
                  : 'kpi'
      const id = `${type[0]}${nextId++}`
      const defaults: Record<
        'sticky' | 'frame' | 'table' | 'source' | 'golden' | 'kpi',
        Partial<BoardItem> & { w: number; h: number; text: string }
      > = {
        sticky: { w: 140, h: 90, text: 'Nouvelle sticky' },
        frame: { w: 220, h: 160, text: 'Nouveau frame' },
        table: { w: 300, h: 168, text: 'Nouveau tableau', cells: EMPTY_TABLE_CELLS },
        source: {
          ...sourceDims('chip', 'fichier.csv'),
          text: 'fichier.csv',
          view: 'chip',
          cells: EMPTY_TABLE_CELLS,
        },
        golden: {
          ...goldenDims('chip', 'last-mile'),
          text: 'last-mile',
          view: 'chip',
          cells: GOLDEN_CELLS,
        },
        kpi: {
          w: KPI_W,
          h: KPI_H,
          text: 'Nouveau KPI',
          measure: '—',
          spark: [20, 28, 24, 35, 30, 42, 38, 45],
          chartKind: 'spark',
        },
      }
      const def = defaults[type]
      const item: BoardItem = {
        id,
        type,
        x: snap(p.x, e.altKey),
        y: snap(p.y, e.altKey),
        w: def.w,
        h: def.h,
        text: def.text,
        ...(def.cells ? { cells: def.cells } : {}),
        ...(def.view ? { view: def.view } : {}),
        ...(def.measure != null ? { measure: def.measure } : {}),
        ...(def.spark ? { spark: def.spark } : {}),
        ...(def.chartKind ? { chartKind: def.chartKind } : {}),
      }
      setItems((prev) => [...prev, item])
      setSelectedIds([id])
      setTool('Select')
      pushLog(`Created ${type} “${def.text}”`)
      return
    }

    if (tool === 'Arrow') {
      setConnectorDraft(null)
      setSelectedIds([])
      return
    }

    setConnectorDraft(null)
    canvas.setPointerCapture(e.pointerId)
    dragRef.current = {
      mode: 'marquee',
      startX: e.clientX,
      startY: e.clientY,
      origScrollLeft: 0,
      origScrollTop: 0,
      origins: { __mq: { x: p.x, y: p.y } },
      moved: false,
      count: 0,
    }
    setMarquee({ x: p.x, y: p.y, w: 0, h: 0 })
  }

  const onDoubleClickItem = (e: React.MouseEvent, item: BoardItem) => {
    if (!isEditableType(item.type)) return
    e.stopPropagation()
    if (clickToggleTimer.current) {
      clearTimeout(clickToggleTimer.current)
      clickToggleTimer.current = null
    }
    setEditingId(item.id)
    setSelectedIds([item.id])
  }

  const onEditKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      commitEdit()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setEditingId(null)
    }
  }

  const tidy = () => {
    const itemSelected = selectedIds.filter((id) => items.some((it) => it.id === id))
    const targets = itemSelected.length > 0 ? itemSelected : items.map((it) => it.id)
    const targetSet = new Set(targets)

    setItems((prev) => {
      const next = prev.map((it) =>
        targetSet.has(it.id)
          ? { ...it, x: snap(it.x, false), y: snap(it.y, false) }
          : { ...it },
      )
      const stickies = next.filter((it) => it.type === 'sticky' && targetSet.has(it.id))
      for (let i = 0; i < stickies.length; i++) {
        for (let j = i + 1; j < stickies.length; j++) {
          const a = stickies[i]
          const b = stickies[j]
          if (!rectsIntersect(a, { ...b, w: b.w + 4, h: b.h + 4 })) continue
          const overlapX = a.x + a.w + GRID - b.x
          const overlapY = a.y + a.h + GRID - b.y
          if (overlapX > 0 && overlapY > 0) {
            if (overlapX <= overlapY) b.x = snap(a.x + a.w + GRID, false)
            else b.y = snap(a.y + a.h + GRID, false)
          }
        }
      }
      const byId = new Map(stickies.map((s) => [s.id, s]))
      return next.map((it) => byId.get(it.id) ?? it)
    })
    pushLog('Tidied board')
  }

  const primaryItem =
    selectedIds.length === 1 ? items.find((i) => i.id === selectedIds[0]) : undefined
  const primaryConn =
    selectedIds.length === 1 ? connectors.find((c) => c.id === selectedIds[0]) : undefined

  const widItems =
    selectedIds.length > 1
      ? [{ t: 'now', a: `Selected ${selectedIds.length} items` }, ...log.slice(0, 5)]
      : primaryItem
        ? [
            { t: 'now', a: `Selected ${primaryItem.type}: “${primaryItem.text}”` },
            { t: 'pos', a: `at (${Math.round(primaryItem.x)}, ${Math.round(primaryItem.y)})` },
            ...log.slice(0, 4),
          ]
        : primaryConn
          ? [{ t: 'now', a: 'Selected connector' }, ...log.slice(0, 5)]
          : connectorDraft
            ? [{ t: 'now', a: 'Pick connector target…' }, ...log.slice(0, 5)]
            : log

  const scopeLabel =
    selectedIds.length > 1
      ? `${selectedIds.length} selected`
      : primaryItem
        ? primaryItem.text.slice(0, 28)
        : primaryConn
          ? 'Connector'
          : 'Global'

  const canvasW = Math.max(1200, ...items.map((i) => i.x + i.w + 200))
  const canvasH = Math.max(800, ...items.map((i) => i.y + i.h + 200))

  return (
    <Shell3
      toolProps={{ active: tool, onSelect: (t) => setTool(t as ToolName), onTidy: tidy, variant: 'board' }}
      center={
        <section className="panel">
          <div className="panel-title">Board</div>
          <div
            className={`board-canvas tool-${tool.toLowerCase()}${spaceDown ? ' panning' : ''}${connectorDraft ? ' connecting' : ''}`}
            ref={canvasRef}
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <div
              className="board-zoom-space"
              style={{ width: canvasW * zoom, height: canvasH * zoom }}
            >
            <div
              className="board-world"
              style={{
                width: canvasW,
                height: canvasH,
                transform: `scale(${zoom})`,
                transformOrigin: '0 0',
              }}
            >
              <svg className="board-connectors" width={canvasW} height={canvasH}>
                <defs>
                  <marker
                    id="tala-arrowhead"
                    markerWidth="8"
                    markerHeight="8"
                    refX="6"
                    refY="3"
                    orient="auto"
                    markerUnits="strokeWidth"
                  >
                    <path d="M0,0 L6,3 L0,6 Z" fill="currentColor" />
                  </marker>
                </defs>
                {connectors.map((c) => {
                  const from = items.find((i) => i.id === c.fromId)
                  const to = items.find((i) => i.id === c.toId)
                  if (!from || !to) return null
                  const a = edgePoint(from, to)
                  const b = edgePoint(to, from)
                  const selected = selectedIds.includes(c.id)
                  return (
                    <g
                      key={c.id}
                      className={`board-connector${selected ? ' selected' : ''}`}
                      onPointerDown={(ev) => onPointerDownConnector(ev, c.id)}
                    >
                      <line
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        stroke="transparent"
                        strokeWidth={14}
                        style={{ cursor: 'pointer' }}
                      />
                      <line
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        stroke="currentColor"
                        strokeWidth={selected ? 2.5 : 1.75}
                        markerEnd="url(#tala-arrowhead)"
                        style={{ pointerEvents: 'none' }}
                      />
                    </g>
                  )
                })}
              </svg>

              {items.map((item) => {
                const selected = selectedIds.includes(item.id)
                const isEditing = editingId === item.id
                const grid = item.cells ?? EMPTY_TABLE_CELLS
                const isApercu =
                  (item.type === 'source' || item.type === 'golden') && item.view === 'apercu'
                const isChip =
                  (item.type === 'source' || item.type === 'golden') && item.view !== 'apercu'
                return (
                  <div
                    key={item.id}
                    className={`board-item board-${item.type}${isApercu ? ' is-apercu' : ''}${selected ? ' selected' : ''}${connectorDraft === item.id ? ' connect-source' : ''}`}
                    style={{
                      left: item.x,
                      top: item.y,
                      width: item.w,
                      minHeight: item.h,
                      height: isChip || item.type === 'kpi' ? item.h : undefined,
                    }}
                    onPointerDown={(ev) => onPointerDownItem(ev, item)}
                    onDoubleClick={(ev) => onDoubleClickItem(ev, item)}
                  >
                    {item.type === 'frame' && (
                      <div
                        className={`board-frame-label${isEditing ? ' editing' : ''}`}
                        contentEditable={isEditing}
                        suppressContentEditableWarning
                        ref={isEditing ? editRef : undefined}
                        onBlur={isEditing ? commitEdit : undefined}
                        onKeyDown={isEditing ? onEditKeyDown : undefined}
                        onPointerDown={isEditing ? (ev) => ev.stopPropagation() : undefined}
                      >
                        {item.text}
                      </div>
                    )}
                    {item.type === 'sticky' && (
                      <div
                        className={`board-sticky-text${isEditing ? ' editing' : ''}`}
                        contentEditable={isEditing}
                        suppressContentEditableWarning
                        ref={isEditing ? editRef : undefined}
                        onBlur={isEditing ? commitEdit : undefined}
                        onKeyDown={isEditing ? onEditKeyDown : undefined}
                        onPointerDown={isEditing ? (ev) => ev.stopPropagation() : undefined}
                      >
                        {item.text}
                      </div>
                    )}
                    {item.type === 'source' && !isApercu && (
                      <div className="board-source-chip">
                        <span className="board-source-ico" aria-hidden />
                        <div
                          className={`board-source-name${isEditing ? ' editing' : ''}`}
                          contentEditable={isEditing}
                          suppressContentEditableWarning
                          ref={isEditing ? editRef : undefined}
                          onBlur={isEditing ? commitEdit : undefined}
                          onKeyDown={isEditing ? onEditKeyDown : undefined}
                          onPointerDown={isEditing ? (ev) => ev.stopPropagation() : undefined}
                        >
                          {item.text}
                        </div>
                      </div>
                    )}
                    {item.type === 'golden' && !isApercu && (
                      <div className="board-golden-chip">
                        <span className="board-golden-ico" aria-hidden />
                        <div
                          className={`board-golden-name${isEditing ? ' editing' : ''}`}
                          contentEditable={isEditing}
                          suppressContentEditableWarning
                          ref={isEditing ? editRef : undefined}
                          onBlur={isEditing ? commitEdit : undefined}
                          onKeyDown={isEditing ? onEditKeyDown : undefined}
                          onPointerDown={isEditing ? (ev) => ev.stopPropagation() : undefined}
                        >
                          {goldenChipLabel(item.text)}
                        </div>
                      </div>
                    )}
                    {(isApercu || item.type === 'table') && (
                      <div className="board-table-inner">
                        <div
                          className={`board-table-title${isEditing ? ' editing' : ''}`}
                          contentEditable={isEditing}
                          suppressContentEditableWarning
                          ref={isEditing ? editRef : undefined}
                          onBlur={isEditing ? commitEdit : undefined}
                          onKeyDown={isEditing ? onEditKeyDown : undefined}
                          onPointerDown={isEditing ? (ev) => ev.stopPropagation() : undefined}
                        >
                          {item.type === 'golden' ? goldenChipLabel(item.text) : item.text}
                        </div>
                        <table className="board-mini-table">
                          <thead>
                            <tr>
                              {grid[0]?.map((cell, ci) => (
                                <th key={ci}>{cell}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {grid.slice(1).map((row, ri) => (
                              <tr key={ri}>
                                {row.map((cell, ci) => (
                                  <td key={ci}>{cell}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {item.type === 'kpi' && (
                      <div className="board-kpi-inner">
                        <div
                          className={`board-kpi-title${isEditing ? ' editing' : ''}`}
                          contentEditable={isEditing}
                          suppressContentEditableWarning
                          ref={isEditing ? editRef : undefined}
                          onBlur={isEditing ? commitEdit : undefined}
                          onKeyDown={isEditing ? onEditKeyDown : undefined}
                          onPointerDown={isEditing ? (ev) => ev.stopPropagation() : undefined}
                        >
                          {item.text}
                        </div>
                        <div className="board-kpi-measure">{item.measure ?? '—'}</div>
                        <Sparkline
                          values={item.spark ?? [20, 28, 24, 35, 30, 42]}
                          kind={item.chartKind ?? 'spark'}
                        />
                      </div>
                    )}
                    {item.type === 'arrow' && <div className="board-arrow-text">{item.text}</div>}
                  </div>
                )
              })}

              {marquee && (
                <div
                  className="board-marquee"
                  style={{
                    left: marquee.x,
                    top: marquee.y,
                    width: marquee.w,
                    height: marquee.h,
                  }}
                />
              )}
            </div>
            </div>
            <div className="board-zoom-controls" onPointerDown={(e) => e.stopPropagation()}>
              <button type="button" className="board-zoom-btn" aria-label="Zoom arrière" onClick={() => zoomBy(-ZOOM_STEP)}>
                −
              </button>
              <button
                type="button"
                className="board-zoom-pct"
                title="Double-clic : 100%"
                onDoubleClick={zoomTo100}
              >
                {Math.round(zoom * 100)}%
              </button>
              <button type="button" className="board-zoom-btn" aria-label="Zoom avant" onClick={() => zoomBy(ZOOM_STEP)}>
                +
              </button>
              <button type="button" className="board-zoom-btn board-zoom-fit" title="Ajuster" aria-label="Ajuster" onClick={zoomToFit}>
                ⤢
              </button>
            </div>
          </div>
        </section>
      }
      wid={<WhatIveDone scope={scopeLabel} day="Lun 13" items={widItems} />}
      footer={
        <Footer
          placeholder="Propose une analyse…"
          action={
            <Link className="btn primary" to="/kpi">
              Vers KPI
            </Link>
          }
        />
      }
    />
  )
}
