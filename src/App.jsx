import { useState, useEffect } from 'react'
import { useMsal } from '@azure/msal-react'
import AuthGuard from './components/AuthGuard'
import ActivityForm from './components/ActivityForm'
import NotesList from './components/NotesList'

const TABS = [
  { id: 'new', label: 'New Activity', icon: 'add' },
  { id: 'browse', label: 'Browse', icon: 'search' },
]

function getInitialTheme() {
  try {
    const stored = localStorage.getItem('dm-theme')
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
  } catch {
    return 'system'
  }
}

function resolveTheme(pref) {
  if (pref === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return pref
}

export default function App() {
  const { instance } = useMsal()
  const [activeTab, setActiveTab] = useState('new')
  const [refreshKey, setRefreshKey] = useState(0)
  const [themePref, setThemePref] = useState(getInitialTheme)

  // Apply theme to document
  useEffect(() => {
    const apply = () => {
      document.documentElement.setAttribute('data-theme', resolveTheme(themePref))
    }
    apply()

    if (themePref === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      mq.addEventListener('change', apply)
      return () => mq.removeEventListener('change', apply)
    }
  }, [themePref])

function cycleTheme() {
  const next = themePref === 'light' ? 'dark' : themePref === 'dark' ? 'system' : 'light'
  setThemePref(next)
  try { localStorage.setItem('dm-theme', next) } catch {}
}

  const themeIcon = themePref === 'dark' ? 'dark_mode' : themePref === 'light' ? 'light_mode' : 'contrast'

  function handleNoteCreated() {
    setRefreshKey((k) => k + 1)
    setActiveTab('browse')
  }

  return (
    <div className="app">
      {/* Header — 49px with logo */}
      <header className="app-header">
        <span className="header-title">Activities</span>
        <div className="header-right">
          <button
            type="button"
            className="theme-toggle"
            onClick={cycleTheme}
            title={`Theme: ${themePref}`}
            aria-label={`Theme: ${themePref}`}
          >
            <span className="icon" aria-hidden="true">{themeIcon}</span>
          </button>
          <button
            type="button"
            className="sign-out-btn"
            onClick={() => instance.logoutRedirect()}
            title="Sign out"
          >
            <span className="icon">logout</span>
            <span className="sign-out-label">Sign out</span>
          </button>
        </div>
      </header>

      {/* Tab nav */}
      <nav className="tab-nav">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab-btn ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            <span className="icon icon-sm" aria-hidden="true">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main className="app-main">
        <AuthGuard>
          {(currentUserId) => (
            <>
              {activeTab === 'new' && (
                <ActivityForm
                  currentUserId={currentUserId}
                  onNoteCreated={handleNoteCreated}
                />
              )}
              {activeTab === 'browse' && (
                <NotesList refreshKey={refreshKey} />
              )}
            </>
          )}
        </AuthGuard>
      </main>
    </div>
  )
}
