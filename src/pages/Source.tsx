import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

type View = 'home' | 'load'

const recentDrafts = [
  { id: 'd1', name: 'Coût du dernier kilomètre', mode: 'forge' as const, when: 'Hier · 14:18' },
  { id: 'd2', name: 'Brainstorm zones critiques', mode: 'board' as const, when: 'Lun 13 · 10:02' },
  { id: 'd3', name: 'Golden consolidé — COMEX', mode: 'forge' as const, when: 'Ven 10 · 16:40' },
  { id: 'd4', name: 'Idées frets vs tournées', mode: 'board' as const, when: 'Ven 10 · 09:15' },
]

export default function Source() {
  const [view, setView] = useState<View>('home')
  const navigate = useNavigate()

  return (
    <div className="full">
      <div className="intake-wrap">
        <div className="intake-card">
          {view === 'home' && (
            <div className="intake-actions">
              <button className="btn primary intake-btn" type="button" onClick={() => navigate('/board')}>
                Nouveau
              </button>
              <button className="btn intake-btn" type="button" onClick={() => setView('load')}>
                Load
              </button>
            </div>
          )}

          {view === 'load' && (
            <>
              <button className="btn linkish" type="button" onClick={() => setView('home')}>← Retour</button>
              <ul className="draft-list">
                {recentDrafts.map((d) => (
                  <li key={d.id}>
                    <Link to={d.mode === 'forge' ? '/forge' : '/board'} className="draft-row">
                      <span className="draft-name">{d.name}</span>
                      <span className="draft-meta">
                        <span className="chip">{d.mode === 'forge' ? 'Forge' : 'Board'}</span>
                        <span className="draft-when">{d.when}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
