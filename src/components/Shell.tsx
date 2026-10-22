import { useEffect, useId, useState, type ReactNode, type SVGProps } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Panel, Group, Separator } from 'react-resizable-panels'

/** Board tools for drag-and-drop data flow canvas. */
export const BOARD_TOOLS = ['Select', 'Arrow', 'Source', 'Golden', 'KPI'] as const
/** Data tools for Forge. */
export const FORGE_TOOLS = ['Select', 'Filter', 'Sort', 'SUM', 'IF'] as const

/** @deprecated Prefer BOARD_TOOLS — kept for Board compat. */
export const TOOLS = BOARD_TOOLS

export type BoardToolName = (typeof BOARD_TOOLS)[number]
export type ForgeToolName = (typeof FORGE_TOOLS)[number]
export type ToolName = BoardToolName

export type ToolsVariant = 'board' | 'forge'
type PaletteTool = BoardToolName | ForgeToolName

function isPaletteTool(name: string): name is PaletteTool {
  return (BOARD_TOOLS as readonly string[]).includes(name) || (FORGE_TOOLS as readonly string[]).includes(name)
}

function ToolMark({ name }: { name: PaletteTool }) {
  const props: SVGProps<SVGSVGElement> = {
    className: 'tool-mark',
    width: 20,
    height: 20,
    viewBox: '0 0 20 20',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  }
  switch (name) {
    case 'Select':
      return (
        <svg {...props}>
          <path d="M5 3.2v11.1l2.4-2.2 2.1 4.1 1.6-.8-2.1-4.1H13.2L5 3.2z" />
        </svg>
      )
    case 'Arrow':
      return (
        <svg {...props}>
          <path d="M3 10h11" />
          <path d="M10.5 6.2 14.8 10l-4.3 3.8" />
        </svg>
      )
    case 'Source':
      return (
        <svg {...props}>
          <rect x="4" y="3" width="12" height="14" rx="1.5" />
          <path d="M7 7.5h6M7 10.5h6M7 13.5h4" />
        </svg>
      )
    case 'Golden':
      return (
        <svg {...props}>
          <path d="M10 3.2 16.2 6.6 10 10 3.8 6.6 10 3.2z" />
          <path d="M3.8 9.6 10 13l6.2-3.4" />
          <path d="M3.8 12.6 10 16l6.2-3.4" />
        </svg>
      )
    case 'KPI':
      return (
        <svg {...props}>
          <path d="M3.5 16.2h13" />
          <path d="M6 16.2V9.5M10 16.2V5.2M14 16.2V11" />
        </svg>
      )
    case 'Filter':
      return (
        <svg {...props}>
          <path d="M3.5 4.5h13l-4.6 5.4V15l-3.8 1.8v-7L3.5 4.5z" />
        </svg>
      )
    case 'Sort':
      return (
        <svg {...props}>
          <path d="M6 4.5v9.2M6 4.5 3.6 7M6 4.5 8.4 7M14 15.5V6.3M14 15.5l-2.4-2.5M14 15.5l2.4-2.5" />
        </svg>
      )
    case 'SUM':
      return (
        <svg {...props}>
          <path d="M14 4.5H6.2L11 10 6.2 15.5H14" />
        </svg>
      )
    case 'IF':
      return (
        <svg {...props}>
          <path d="M4.5 4v12M4.5 10h5.2l4.8-4.6M9.7 10l4.8 4.6" />
        </svg>
      )
    default: {
      const _exhaustive: never = name
      return _exhaustive
    }
  }
}

export function AppHeader() {
  return (
    <header className="header">
      <Link to="/source" className="brand">Cut Knot</Link>
      <nav>
        <NavLink to="/source">Source</NavLink>
        <NavLink to="/forge">Forge</NavLink>
        <NavLink to="/board">Board</NavLink>
        <NavLink to="/golden">Golden</NavLink>
        <NavLink to="/kpi">KPI</NavLink>
      </nav>
    </header>
  )
}

export function Tools({
  active = 'Select',
  onSelect,
  onTidy,
  tools,
  variant = 'board',
}: {
  active?: string
  onSelect?: (t: string) => void
  onTidy?: () => void
  /** Custom tool labels; overrides variant defaults. */
  tools?: readonly string[]
  variant?: ToolsVariant
}) {
  const list =
    tools ??
    (variant === 'forge' ? FORGE_TOOLS : BOARD_TOOLS)

  return (
    <aside className="panel tools">
      {list.map((t) => (
        <button
          key={t}
          className={`tool${active === t ? ' active' : ''}`}
          type="button"
          aria-pressed={active === t}
          onClick={() => onSelect?.(t)}
        >
          {isPaletteTool(t) ? <ToolMark name={t} /> : <span className="ico" aria-hidden="true" />}
          <span className="tool-label">{t}</span>
        </button>
      ))}
      {onTidy && (
        <button className="tool tool-tidy" type="button" onClick={onTidy} title="Snap & pack">
          <span className="ico ico-tidy" aria-hidden="true" />
          Tidy
        </button>
      )}
    </aside>
  )
}

type WidItem = { t: string; a: string; state?: 'current' | 'done' | 'deleted' }

export function WhatIveDone({ scope, day, items }: { scope: string; day: string; items: WidItem[] }) {
  return (
    <aside className="panel">
      <div className="panel-title">What I&apos;ve done <span>· {scope}</span></div>
      <div className="wid-day">{day}</div>
      <ul className="wid-list">
        {items.map((x, i) => (
          <li
            key={`${i}-${x.t}-${x.a}`}
            className={x.state ? `wid-${x.state}` : undefined}
            style={x.state === 'deleted' ? { pointerEvents: 'none' } : undefined}
          >
            <span className="t">{x.t}</span>
            <span className="a">{x.a}</span>
          </li>
        ))}
      </ul>
    </aside>
  )
}

export function Footer({
  placeholder,
  action,
  label = 'Demande',
}: {
  placeholder: string
  action?: ReactNode
  label?: string
}) {
  const fieldId = useId()
  return (
    <footer className="footer">
      <label className="footer-label" htmlFor={fieldId}>
        {label}
      </label>
      <input id={fieldId} type="text" placeholder={placeholder} />
      {action}
    </footer>
  )
}

export type ToolProps = {
  active: string
  onSelect: (t: string) => void
  onTidy?: () => void
  tools?: readonly string[]
  variant?: ToolsVariant
}

function useNarrowShell() {
  const query = '(max-width: 768px)'
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const media = window.matchMedia(query)
    const onChange = () => setNarrow(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])
  return narrow
}

export function Shell3({
  center,
  wid,
  footer,
  toolProps,
}: {
  center: ReactNode
  wid: ReactNode
  footer: ReactNode
  toolProps?: ToolProps
}) {
  const narrow = useNarrowShell()
  return (
    <div className="shell">
      <Group orientation={narrow ? 'vertical' : 'horizontal'} className="main-panels">
        <Panel
          defaultSize={narrow ? '148px' : '200px'}
          minSize={narrow ? '120px' : '160px'}
          maxSize={narrow ? '220px' : '400px'}
          className="tools-panel-wrapper"
        >
          <Tools
            active={toolProps?.active}
            onSelect={toolProps?.onSelect}
            onTidy={toolProps?.onTidy}
            tools={toolProps?.tools}
            variant={toolProps?.variant}
          />
        </Panel>
        <Separator className="resize-handle" />
        <Panel minSize={narrow ? '160px' : '350px'} className="center-panel-wrapper">
          {center}
        </Panel>
        <Separator className="resize-handle" />
        <Panel
          defaultSize={narrow ? '160px' : '420px'}
          minSize={narrow ? '120px' : '280px'}
          maxSize={narrow ? '240px' : '700px'}
          className="wid-panel-wrapper"
        >
          {wid}
        </Panel>
      </Group>
      {footer}
    </div>
  )
}
