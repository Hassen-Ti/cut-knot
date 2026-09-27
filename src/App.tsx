import { Navigate, Route, Routes } from 'react-router-dom'
import { AppHeader } from './components/Shell'
import Source from './pages/Source'
import Forge from './pages/Forge'
import Board from './pages/Board'
import AddFiles from './pages/AddFiles'
import Golden from './pages/Golden'
import Kpi from './pages/Kpi'
import './styles.css'

export default function App() {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <AppHeader />
      <div style={{ flex: 1, minHeight: 0 }}>
        <Routes>
          <Route path="/" element={<Navigate to="/source" replace />} />
          <Route path="/source" element={<Source />} />
          <Route path="/intake" element={<Navigate to="/source" replace />} />
          <Route path="/forge" element={<Forge />} />
          <Route path="/board" element={<Board />} />
          <Route path="/add-files" element={<AddFiles />} />
          <Route path="/golden" element={<Golden />} />
          <Route path="/kpi" element={<Kpi />} />
          {/* legacy aliases */}
          <Route path="/laboratoire" element={<Navigate to="/forge" replace />} />
          <Route path="/atelier" element={<Navigate to="/board" replace />} />
          <Route path="/blank" element={<Navigate to="/board" replace />} />
        </Routes>
      </div>
    </div>
  )
}
