import { Link, NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'
import { Panel, Group, Separator } from 'react-resizable-panels'

/** Miro / Board tools (default). */
export const BOARD_TOOLS = ['Select', 'Sticky', 'Frame', 'Arrow', 'Table', 'Source', 'Golden', 'KPI'] as const
/** Data tools for Forge. */
export const FORGE_TOOLS = ['Select', 'Filter', 'Sort', 'SUM', 'IF'] as const

/** @deprecated Prefer BOARD_TOOLS — kept for Board compat. */
export const TOOLS = BOARD_TOOLS

export type BoardToolName = (typeof BOARD_TOOLS)[number]
export type ForgeToolName = (typeof FORGE_TOOLS)[number]
export type ToolName = BoardToolName

export type ToolsVariant = 'board' | 'forge'

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
          onClick={() => onSelect?.(t)}
        >
          <span className="ico" />
          {t}
        </button>
      ))}
      {onTidy && (
        <button className="tool tool-tidy" type="button" onClick={onTidy} title="Snap & pack">
          <span className="ico ico-tidy" />
          Tidy
        </button>
      )}
    </aside>
  )
}

type WidItem = { t: string; a: string }

export function WhatIveDone({ scope, day, items }: { scope: string; day: string; items: WidItem[] }) {
  return (
    <aside className="panel">
      <div className="panel-title">What I&apos;ve done <span>· {scope}</span></div>
      <div className="wid-day">{day}</div>
      <ul className="wid-list">
        {items.map((x, i) => (
          <li key={`${i}-${x.t}-${x.a}`}><span className="t">{x.t}</span><span className="a">{x.a}</span></li>
        ))}
      </ul>
    </aside>
  )
}

export function Footer({ placeholder, action }: { placeholder: string; action?: ReactNode }) {
  return (
    <footer className="footer">
      <input type="text" placeholder={placeholder} />
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
  return (
    <div className="shell">
      <Group orientation="horizontal" className="main-panels" id="main-layout">
        <Panel defaultSize={20} minSize={12} maxSize={35} id="tools-panel" className="tools-panel-wrapper">
          <Tools
            active={toolProps?.active}
            onSelect={toolProps?.onSelect}
            onTidy={toolProps?.onTidy}
            tools={toolProps?.tools}
            variant={toolProps?.variant}
          />
        </Panel>
        <Separator className="resize-handle" />
        <Panel defaultSize={50} minSize={30} id="center-panel" className="center-panel-wrapper">
          {center}
        </Panel>
        <Separator className="resize-handle" />
        <Panel defaultSize={30} minSize={20} maxSize={45} id="wid-panel" className="wid-panel-wrapper">
          {wid}
        </Panel>
      </Group>
      {footer}
    </div>
  )
}
