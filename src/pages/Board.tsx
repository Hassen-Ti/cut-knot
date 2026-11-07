import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Link } from 'react-router-dom'
import { applyCsvToSource, markSourceAndGoldensStale, recomputeBoard } from '../board/compute.ts'
import {
  loadedCsvFromFile,
  pickCsvFile,
  readCsvFromPath,
  type LoadedCsv,
} from '../board/files.ts'
import {
  EMPTY_SOURCE_LABEL,
  KPI_H,
  KPI_W,
  MAX_SOURCES,
  ZOOM_STEP,
  canvasPoint,
  clampZoom,
  edgePoint,
  goldenChipLabel,
  goldenDims,
  isEditableType,
  isToggleable,
  rectsIntersect,
  snap,
  sourceCount,
  sourceDims,
  type BoardItem,
  type Connector,
  type ItemType,
  type SourceView,
} from '../board/model.ts'
import { Footer, Shell3, WhatIveDone, type ToolName } from '../components/Shell'
import { KPI_AGG_LABELS, KPI_AGGS, isKpiAgg, numericColumnNames, parseCsv } from '../csv/index.ts'

const defaultTimeline = [
  { t: '14:02', a: 'Start draft', state: 'done' as const },
  { t: '14:08', a: 'Open Board', state: 'done' as const },
]

let nextId = 1

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

function makeSource(x: number, y: number, alt: boolean): BoardItem {
  const dims = sourceDims('chip', EMPTY_SOURCE_LABEL)
  return {
    id: `s${nextId++}`,
    type: 'source',
    x: snap(x, alt),
    y: snap(y, alt),
    w: dims.w,
    h: dims.h,
    text: EMPTY_SOURCE_LABEL,
    view: 'chip',
  }
}

function makeGolden(x: number, y: number, alt: boolean): BoardItem {
  const dims = goldenDims('chip', 'last-mile')
  return {
    id: `g${nextId++}`,
    type: 'golden',
    x: snap(x, alt),
    y: snap(y, alt),
    w: dims.w,
    h: dims.h,
    text: 'last-mile',
    view: 'chip',
  }
}

function makeKpi(x: number, y: number, alt: boolean): BoardItem {
  return {
    id: `k${nextId++}`,
    type: 'kpi',
    x: snap(x, alt),
    y: snap(y, alt),
    w: KPI_W,
    h: KPI_H,
    text: 'Nouveau KPI',
    measure: '—',
    spark: [20, 28, 24, 35, 30, 42, 38, 45],
    chartKind: 'spark',
  }
}

export default function Board() {
  const [tool, setTool] = useState<ToolName>('Select')
  const [items, setItems] = useState<BoardItem[]>([])
  const [connectors, setConnectors] = useState<Connector[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [log, setLog] = useState(defaultTimeline)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [connectorDraft, setConnectorDraft] = useState<string | null>(null)
  const [spaceDown, setSpaceDown] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [dropTargetId, setDropTargetId] = useState<string | 'canvas' | null>(null)

  const dragRef = useRef<{
    mode: 'move' | 'marquee' | 'pan' | 'retarget'
    startX: number
    startY: number
    origScrollLeft: number
    origScrollTop: number
    origins: Record<string, { x: number; y: number }>
    moved: boolean
    count: number
    connectorId?: string
    end?: 'from' | 'to'
  } | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const pendingScrollRef = useRef<{ left: number; top: number } | null>(null)
  const editRef = useRef<HTMLDivElement>(null)
  const clickToggleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const itemsRef = useRef(items)
  itemsRef.current = items
  const connectorsRef = useRef(connectors)
  connectorsRef.current = connectors
  const selectedRef = useRef(selectedIds)
  selectedRef.current = selectedIds
  const marqueeRef = useRef(marquee)
  marqueeRef.current = marquee

  const pushLog = useCallback((a: string) => {
    const now = new Date()
    const t = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    setLog((prev) => [{ t, a, state: 'done' as const }, ...prev].slice(0, 12))
  }, [])

  const logNewJoinNotes = useCallback(
    (prev: BoardItem[], next: BoardItem[]) => {
      for (const item of next) {
        if (item.type === 'golden') {
          const before = prev.find((row) => row.id === item.id)
          if (item.joinNote && before?.joinNote !== item.joinNote) {
            pushLog(item.joinNote)
          }
          if (item.orphanWarning && before?.orphanWarning !== item.orphanWarning) {
            pushLog(item.orphanWarning)
          }
        }
        if (item.type === 'kpi') {
          const before = prev.find((row) => row.id === item.id)
          if (item.kpiSkippedWarning && before?.kpiSkippedWarning !== item.kpiSkippedWarning) {
            pushLog(item.kpiSkippedWarning)
          }
        }
      }
    },
    [pushLog],
  )

  const applyItems = useCallback((next: BoardItem[]) => {
    const prev = itemsRef.current
    const computed = recomputeBoard(next, connectorsRef.current)
    itemsRef.current = computed
    setItems(computed)
    logNewJoinNotes(prev, computed)
  }, [logNewJoinNotes])

  const applyConnectors = useCallback((next: Connector[]) => {
    const prev = itemsRef.current
    connectorsRef.current = next
    setConnectors(next)
    const computed = recomputeBoard(prev, next)
    itemsRef.current = computed
    setItems(computed)
    logNewJoinNotes(prev, computed)
  }, [logNewJoinNotes])

  const applyCsv = useCallback(
    (id: string, loaded: LoadedCsv) => {
      applyItems(
        itemsRef.current.map((item) => (item.id === id ? applyCsvToSource(item, loaded) : item)),
      )
      if (loaded.error) {
        pushLog(`Erreur « ${loaded.name} »`)
      } else {
        pushLog(`Import « ${loaded.name} »`)
      }
    },
    [applyItems, pushLog],
  )

  const chooseCsv = useCallback(
    async (id: string) => {
      const loaded = await pickCsvFile()
      if (!loaded) return
      applyCsv(id, loaded)
    },
    [applyCsv],
  )

  const reloadSource = useCallback(
    async (id: string) => {
      const item = itemsRef.current.find((row) => row.id === id)
      if (!item?.filePath) return
      const loaded = await readCsvFromPath(item.filePath)
      applyCsv(id, loaded)
    },
    [applyCsv],
  )

  const sourceWatchKey = items
    .filter((it) => it.type === 'source' && it.filePath)
    .map((it) => `${it.id}:${it.filePath}`)
    .sort()
    .join('|')

  useEffect(() => {
    const api = window.cutknot
    if (!api) return
    const watched = itemsRef.current.filter((item) => item.type === 'source' && item.filePath)
    const stops: Array<() => void> = []
    for (const item of watched) {
      const sourceId = item.id
      const filePath = item.filePath
      if (!filePath) continue
      stops.push(
        api.watchFile(filePath, () => {
          setItems((prev) => markSourceAndGoldensStale(prev, connectorsRef.current, sourceId))
          pushLog('Fichier modifié')
        }),
      )
    }
    return () => {
      for (const stop of stops) stop()
    }
  }, [sourceWatchKey, pushLog])

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
        applyConnectors(
          connectorsRef.current.filter(
            (c) => !idSet.has(c.id) && !idSet.has(c.fromId) && !idSet.has(c.toId),
          ),
        )
        applyItems(itemsRef.current.filter((it) => !idSet.has(it.id)))
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
  }, [editingId, pushLog, applyItems, applyConnectors])

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
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
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
      applyConnectors([...connectorsRef.current, { id, type: 'connector', fromId: connectorDraft, toId: item.id }])
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
      setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
    } else {
      setSelectedIds([id])
    }
  }

  const onPointerDownHandle = (e: ReactPointerEvent, id: string, end: 'from' | 'to') => {
    if (spaceDown || e.button === 1) return
    e.stopPropagation()
    e.preventDefault()
    setSelectedIds([id])
    ;(e.currentTarget as SVGElement).setPointerCapture(e.pointerId)
    dragRef.current = {
      mode: 'retarget',
      startX: e.clientX,
      startY: e.clientY,
      origScrollLeft: 0,
      origScrollTop: 0,
      origins: {},
      moved: false,
      count: 1,
      connectorId: id,
      end,
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

    if (d.mode === 'retarget') {
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

  const itemAtPoint = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const p = canvasPoint(canvas, clientX, clientY, zoomRef.current)
    const hit = [...itemsRef.current]
      .reverse()
      .find((it) => rectsIntersect({ x: p.x, y: p.y, w: 1, h: 1 }, { x: it.x, y: it.y, w: it.w, h: it.h }))
    return hit
  }

  const onPointerUp = (e: ReactPointerEvent) => {
    const d = dragRef.current
    if (!d) return
    const canvas = canvasRef.current

    if (d.mode === 'retarget' && d.connectorId && d.end) {
      const hit = itemAtPoint(e.clientX, e.clientY)
      if (hit) {
        applyConnectors(
          connectorsRef.current.map((c) => {
            if (c.id !== d.connectorId) return c
            if (d.end === 'from' && hit.id !== c.toId) return { ...c, fromId: hit.id }
            if (d.end === 'to' && hit.id !== c.fromId) return { ...c, toId: hit.id }
            return c
          }),
        )
        pushLog('Flèche déplacée')
      }
      dragRef.current = null
      return
    }

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
      const ids = Object.keys(d.origins)
      if (ids.length === 1) {
        const id = ids[0]!
        const current = itemsRef.current.find((i) => i.id === id)
        if (current?.type === 'source' && !current.cells && !current.error) {
          void chooseCsv(id)
          dragRef.current = null
          return
        }
        if (clickToggleTimer.current) clearTimeout(clickToggleTimer.current)
        clickToggleTimer.current = setTimeout(() => {
          clickToggleTimer.current = null
          const it = itemsRef.current.find((i) => i.id === id)
          if (!it || !isToggleable(it.type)) return
          const nextView: SourceView = it.view === 'apercu' ? 'chip' : 'apercu'
          const dims = it.type === 'golden' ? goldenDims(nextView, it.text) : sourceDims(nextView, it.text)
          setItems((prev) =>
            prev.map((row) => (row.id === it.id ? { ...row, view: nextView, w: dims.w, h: dims.h } : row)),
          )
          pushLog(nextView === 'apercu' ? `Aperçu « ${it.text} »` : `Chip « ${it.text} »`)
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

    if (tool === 'Source' || tool === 'Golden' || tool === 'KPI') {
      const type: ItemType = tool === 'Source' ? 'source' : tool === 'Golden' ? 'golden' : 'kpi'
      if (type === 'source' && sourceCount(items) >= MAX_SOURCES) {
        pushLog('10 sources max')
        return
      }
      const item =
        type === 'source' ? makeSource(p.x, p.y, e.altKey) : type === 'golden' ? makeGolden(p.x, p.y, e.altKey) : makeKpi(p.x, p.y, e.altKey)
      applyItems([...items, item])
      setSelectedIds([item.id])
      setTool('Select')
      pushLog(`Created ${type} “${item.text}”`)
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

  const onDragOverCanvas = (e: ReactDragEvent) => {
    if (![...e.dataTransfer.types].includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDropTargetId((prev) => prev ?? 'canvas')
  }

  const onDragOverItem = (e: ReactDragEvent, item: BoardItem) => {
    if (item.type !== 'source') return
    if (![...e.dataTransfer.types].includes('Files')) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
    setDropTargetId(item.id)
  }

  const finishDrop = () => setDropTargetId(null)

  const dropOnSource = async (id: string, file: File) => {
    const loaded = await loadedCsvFromFile(file)
    applyCsv(id, loaded)
  }

  const dropOnCanvas = async (file: File, x: number, y: number) => {
    if (sourceCount(itemsRef.current) >= MAX_SOURCES) {
      pushLog('10 sources max')
      return
    }
    const item = makeSource(x, y, false)
    applyItems([...itemsRef.current, item])
    setSelectedIds([item.id])
    const loaded = await loadedCsvFromFile(file)
    applyCsv(item.id, loaded)
  }

  const onDropCanvas = (e: ReactDragEvent) => {
    if (![...e.dataTransfer.types].includes('Files')) return
    e.preventDefault()
    finishDrop()
    const file = [...e.dataTransfer.files].find((f) => f.name.toLowerCase().endsWith('.csv'))
    if (!file) return
    const canvas = canvasRef.current
    if (!canvas) return
    const p = canvasPoint(canvas, e.clientX, e.clientY, zoomRef.current)
    void dropOnCanvas(file, p.x, p.y)
  }

  const onDropItem = (e: ReactDragEvent, item: BoardItem) => {
    if (item.type !== 'source') return
    if (![...e.dataTransfer.types].includes('Files')) return
    e.preventDefault()
    e.stopPropagation()
    finishDrop()
    const file = [...e.dataTransfer.files].find((f) => f.name.toLowerCase().endsWith('.csv'))
    if (!file) return
    void dropOnSource(item.id, file)
  }

  const setKpiPicker = (id: string, patch: Partial<Pick<BoardItem, 'kpiAgg' | 'kpiColumn' | 'kpiNumerator' | 'kpiDenominator'>>) => {
    applyItems(
      itemsRef.current.map((item) => (item.id === id ? { ...item, ...patch, kpiReady: true } : item)),
    )
  }

  useEffect(() => {
    window.__cutknotBoard = {
      getState: () => ({ items: itemsRef.current, connectors: connectorsRef.current }),
      loadFromPath: async (id, filePath) => {
        const loaded = await readCsvFromPath(filePath)
        applyCsv(id, loaded)
      },
      loadFromText: (id, fileName, text) => {
        try {
          applyCsv(id, { name: fileName, cells: parseCsv(text), filePath: undefined })
        } catch (error) {
          applyCsv(id, {
            name: fileName,
            error: error instanceof Error ? error.message : 'Fichier illisible',
          })
        }
      },
      createSource: (x, y) => {
        const item = makeSource(x, y, false)
        applyItems([...itemsRef.current, item])
        return item.id
      },
      createGolden: (x, y) => {
        const item = makeGolden(x, y, false)
        applyItems([...itemsRef.current, item])
        return item.id
      },
      createKpi: (x, y) => {
        const item = makeKpi(x, y, false)
        applyItems([...itemsRef.current, item])
        return item.id
      },
      connect: (fromId, toId) => {
        const id = `c${nextId++}`
        applyConnectors([...connectorsRef.current, { id, type: 'connector', fromId, toId }])
        return id
      },
      retarget: (connectorId, fromId, toId) => {
        applyConnectors(
          connectorsRef.current.map((c) => {
            if (c.id !== connectorId) return c
            return { ...c, fromId: fromId ?? c.fromId, toId: toId ?? c.toId }
          }),
        )
      },
      setKpiPicker: (id, spec) => {
        applyItems(
          itemsRef.current.map((item) =>
            item.id === id
              ? {
                  ...item,
                  kpiReady: true,
                  kpiAgg: spec.agg,
                  kpiColumn: spec.column ?? item.kpiColumn,
                  kpiNumerator: spec.numerator ?? item.kpiNumerator,
                  kpiDenominator: spec.denominator ?? item.kpiDenominator,
                  text: spec.title ?? item.text,
                }
              : item,
          ),
        )
      },
      setView: (id, view) => {
        applyItems(
          itemsRef.current.map((item) => {
            if (item.id !== id) return item
            const dims = item.type === 'golden' ? goldenDims(view, item.text) : sourceDims(view, item.text)
            return { ...item, view, w: dims.w, h: dims.h }
          }),
        )
      },
    }
    return () => {
      delete window.__cutknotBoard
    }
  }, [applyCsv, applyItems, applyConnectors])

  const primaryItem = selectedIds.length === 1 ? items.find((i) => i.id === selectedIds[0]) : undefined
  const primaryConn = selectedIds.length === 1 ? connectors.find((c) => c.id === selectedIds[0]) : undefined

  const widItems =
    selectedIds.length > 1
      ? [{ t: 'now', a: `Selected ${selectedIds.length} items`, state: 'current' as const }, ...log.slice(0, 5)]
      : primaryItem
        ? [
            { t: 'now', a: `Selected ${primaryItem.type}: “${primaryItem.text}”`, state: 'current' as const },
            { t: 'pos', a: `at (${Math.round(primaryItem.x)}, ${Math.round(primaryItem.y)})`, state: 'current' as const },
            ...log.slice(0, 4),
          ]
        : primaryConn
          ? [{ t: 'now', a: 'Selected connector', state: 'current' as const }, ...log.slice(0, 5)]
          : connectorDraft
            ? [{ t: 'now', a: 'Pick connector target…', state: 'current' as const }, ...log.slice(0, 5)]
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
      toolProps={{ active: tool, onSelect: (t) => setTool(t as ToolName), variant: 'board' }}
      center={
        <section className="panel">
          <div className="board-titlebar">
            <div className="panel-title">Board</div>
            <div className="board-zoom-controls" onPointerDown={(e) => e.stopPropagation()}>
              <button type="button" className="board-zoom-btn" aria-label="Zoom arrière" onClick={() => zoomBy(-ZOOM_STEP)}>
                −
              </button>
              <button type="button" className="board-zoom-pct" title="Double-clic : 100%" onDoubleClick={zoomTo100}>
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
          <div
            className={`board-canvas tool-${tool.toLowerCase()}${spaceDown ? ' panning' : ''}${connectorDraft ? ' connecting' : ''}${dropTargetId === 'canvas' ? ' is-drop-target' : ''}`}
            ref={canvasRef}
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDragOver={onDragOverCanvas}
            onDragLeave={() => setDropTargetId(null)}
            onDrop={onDropCanvas}
          >
            <div className="board-zoom-space" style={{ width: canvasW * zoom, height: canvasH * zoom }}>
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
                        data-testid={`connector-${c.id}`}
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
                        {selected && (
                          <>
                            <circle
                              className="board-connector-handle"
                              cx={a.x}
                              cy={a.y}
                              r={6}
                              onPointerDown={(ev) => onPointerDownHandle(ev, c.id, 'from')}
                            />
                            <circle
                              className="board-connector-handle"
                              cx={b.x}
                              cy={b.y}
                              r={6}
                              onPointerDown={(ev) => onPointerDownHandle(ev, c.id, 'to')}
                            />
                          </>
                        )}
                      </g>
                    )
                  })}
                </svg>

                {items.map((item) => {
                  const selected = selectedIds.includes(item.id)
                  const isEditing = editingId === item.id
                  const grid = item.cells
                  const isApercu = (item.type === 'source' || item.type === 'golden') && item.view === 'apercu'
                  const isChip = (item.type === 'source' || item.type === 'golden') && item.view !== 'apercu'
                  const kpiCols = item.type === 'kpi' ? numericColumnNames(items.find((row) => {
                    return connectors.some((c) => c.fromId === row.id && c.toId === item.id && row.type === 'golden')
                  })?.cells) : []
                  return (
                    <div
                      key={item.id}
                      data-testid={`item-${item.id}`}
                      data-item-type={item.type}
                      className={`board-item board-${item.type}${isApercu ? ' is-apercu' : ''}${selected ? ' selected' : ''}${connectorDraft === item.id ? ' connect-source' : ''}${dropTargetId === item.id ? ' is-drop-target' : ''}${item.stale ? ' is-stale' : ''}${item.error ? ' is-error' : ''}`}
                      style={{
                        left: item.x,
                        top: item.y,
                        width: item.w,
                        minHeight: item.h,
                        height: isChip || item.type === 'kpi' ? item.h : undefined,
                      }}
                      onPointerDown={(ev) => onPointerDownItem(ev, item)}
                      onDoubleClick={(ev) => onDoubleClickItem(ev, item)}
                      onDragOver={(ev) => onDragOverItem(ev, item)}
                      onDrop={(ev) => onDropItem(ev, item)}
                    >
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
                            {goldenChipLabel(item)}
                          </div>
                        </div>
                      )}
                      {isApercu && (
                        <div className="board-table-inner">
                          <div className="board-table-head">
                            <div
                              className={`board-table-title${isEditing ? ' editing' : ''}`}
                              contentEditable={isEditing}
                              suppressContentEditableWarning
                              ref={isEditing ? editRef : undefined}
                              onBlur={isEditing ? commitEdit : undefined}
                              onKeyDown={isEditing ? onEditKeyDown : undefined}
                              onPointerDown={isEditing ? (ev) => ev.stopPropagation() : undefined}
                            >
                              {item.type === 'golden' ? goldenChipLabel(item) : item.text}
                            </div>
                            {item.type === 'source' && (
                              <button
                                type="button"
                                className="board-choose"
                                onPointerDown={(ev) => ev.stopPropagation()}
                                onClick={(ev) => {
                                  ev.stopPropagation()
                                  void chooseCsv(item.id)
                                }}
                              >
                                Choisir CSV
                              </button>
                            )}
                          </div>
                          {grid && grid.length > 0 ? (
                            <div className="board-table-scroll">
                              <table className="board-mini-table" data-testid={item.type === 'golden' ? 'golden-grid' : 'source-grid'}>
                                <thead>
                                  <tr>
                                    {grid[0]?.map((cell, ci) => (
                                      <th key={ci}>{cell}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {grid.slice(1).map((row, ri) => (
                                    <tr key={ri} data-row={row[0]}>
                                      {row.map((cell, ci) => (
                                        <td key={ci}>{cell}</td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <div className="board-empty-grid">Choisir CSV</div>
                          )}
                        </div>
                      )}
                      {item.error && (
                        <div className="board-source-error" data-testid="source-error">
                          {item.error}
                        </div>
                      )}
                      {item.stale && (
                        <button
                          type="button"
                          className="board-stale"
                          data-testid="source-stale"
                          onPointerDown={(ev) => ev.stopPropagation()}
                          onClick={(ev) => {
                            ev.stopPropagation()
                            if (item.type === 'source') void reloadSource(item.id)
                          }}
                        >
                          {item.type === 'source' ? 'fichier modifié' : 'obsolète'}
                        </button>
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
                          <div className="board-kpi-measure" data-testid="kpi-measure">
                            {item.measure ?? '—'}
                          </div>
                          <div
                            className="board-kpi-picker"
                            data-testid="kpi-picker"
                            onPointerDown={(ev) => ev.stopPropagation()}
                          >
                            <select
                              aria-label="Agrégat"
                              value={item.kpiAgg ?? 'mean'}
                              onChange={(ev) => {
                                const value = ev.target.value
                                if (isKpiAgg(value)) setKpiPicker(item.id, { kpiAgg: value })
                              }}
                            >
                              {KPI_AGGS.map((agg) => (
                                <option key={agg} value={agg}>
                                  {KPI_AGG_LABELS[agg]}
                                </option>
                              ))}
                            </select>
                            {item.kpiAgg === 'ratio' ? (
                              <>
                                <select
                                  aria-label="Numérateur"
                                  value={item.kpiNumerator ?? ''}
                                  onChange={(ev) => setKpiPicker(item.id, { kpiNumerator: ev.target.value })}
                                >
                                  <option value="">—</option>
                                  {kpiCols.map((col) => (
                                    <option key={`n-${col}`} value={col}>
                                      {col}
                                    </option>
                                  ))}
                                </select>
                                <span className="board-kpi-ratio-sep">/</span>
                                <select
                                  aria-label="Dénominateur"
                                  value={item.kpiDenominator ?? ''}
                                  onChange={(ev) => setKpiPicker(item.id, { kpiDenominator: ev.target.value })}
                                >
                                  <option value="">—</option>
                                  {kpiCols.map((col) => (
                                    <option key={`d-${col}`} value={col}>
                                      {col}
                                    </option>
                                  ))}
                                </select>
                              </>
                            ) : (
                              <select
                                aria-label="Colonne"
                                value={item.kpiColumn ?? ''}
                                onChange={(ev) => setKpiPicker(item.id, { kpiColumn: ev.target.value })}
                              >
                                <option value="">—</option>
                                {kpiCols.map((col) => (
                                  <option key={col} value={col}>
                                    {col}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                          <Sparkline values={item.spark ?? [20, 28, 24, 35, 30, 42]} kind={item.chartKind ?? 'spark'} />
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
