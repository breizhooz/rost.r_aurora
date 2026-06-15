import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login           from './pages/Login'
import Register        from './pages/Register'
import ForgotPassword  from './pages/ForgotPassword'
import OAuthCallback   from './pages/OAuthCallback'
import AcceptInvite    from './pages/AcceptInvite'
import Confidentialite from './pages/Confidentialite'
import AuroraDashboard from './aurora/AuroraDashboard'
import AuroraJournal   from './aurora/AuroraJournal'
import AuroraSemaine   from './aurora/AuroraSemaine'
import AuroraCourses   from './aurora/AuroraCourses'
import AuroraRecettes  from './aurora/AuroraRecettes'
import AuroraProfil    from './aurora/AuroraProfil'
import AuroraComptes   from './aurora/AuroraComptes'
import AuroraHub       from './aurora/AuroraHub'
import AuroraAdmin     from './aurora/AuroraAdmin'
import AuroraNotifications from './aurora/AuroraNotifications'
import ProtectedRoute from './components/ProtectedRoute'

function P({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute>{children}</ProtectedRoute>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login"            element={<Login />} />
        <Route path="/register"         element={<Register />} />
        <Route path="/forgot-password"  element={<ForgotPassword />} />
        <Route path="/oauth/callback"   element={<OAuthCallback />} />
        <Route path="/accept-invite"    element={<AcceptInvite />} />
        <Route path="/confidentialite"  element={<Confidentialite />} />
        {/* ── Aurora = interface principale (racine) ── */}
        <Route path="/dashboard" element={<P><AuroraDashboard /></P>} />
        <Route path="/journal"   element={<P><AuroraJournal /></P>} />
        <Route path="/semaine"   element={<P><AuroraSemaine /></P>} />
        <Route path="/courses"   element={<P><AuroraCourses /></P>} />
        <Route path="/recettes"  element={<P><AuroraRecettes /></P>} />
        <Route path="/profil"    element={<P><AuroraProfil /></P>} />
        <Route path="/comptes"   element={<P><AuroraComptes /></P>} />
        <Route path="/hub"       element={<P><AuroraHub /></P>} />
        <Route path="/notifications" element={<P><AuroraNotifications /></P>} />
        <Route path="/admin"     element={<P><AuroraAdmin /></P>} />
        {/* ── Anciens chemins (/aurora/*, /old/*) → racine ── */}
        <Route path="/aurora/*"  element={<Navigate to="/dashboard" replace />} />
        <Route path="/old/*"     element={<Navigate to="/dashboard" replace />} />
        <Route path="*"          element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
