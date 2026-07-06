import { useState, useEffect } from 'react'
import { useMsal } from '@azure/msal-react'
import AuthGuard from './components/AuthGuard'
import ActivityForm from './components/ActivityForm'
import NotesList from './components/NotesList'
import useTamContext from './hooks/useTamContext'
import SubscriptionsPanel from './components/SubscriptionsPanel'
import { signOut as dmaSignOut, isDataMinerHost, getDmaUser } from './api/dataminer'

const TABS = [
  { id: 'new', label: 'New Activity', icon: 'add' },
  { id: 'browse', label: 'Activities', icon: 'search' },
  { id: 'subscriptions', label: 'Subscriptions', icon: 'notifications' },
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
  const { managedAccounts, loading: tamLoading } = useTamContext()
  const [activeTab, setActiveTab] = useState('new')
  const [refreshKey, setRefreshKey] = useState(0)
  const [browseAccount, setBrowseAccount] = useState(null)
  const [themePref, setThemePref] = useState(getInitialTheme)
  const [dmaConnection, setDmaConnection] = useState(null)

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

  const dmaUser = isDataMinerHost() ? getDmaUser() : null
  const subscriptionsAvailable = Boolean(dmaConnection)

  const themeIcon = themePref === 'dark' ? 'dark_mode' : themePref === 'light' ? 'light_mode' : 'contrast'

  function handleNoteCreated(account) {
    setBrowseAccount(account || null)
    setRefreshKey((k) => k + 1)
    setActiveTab('browse')
  }

  return (
    <div className="app">
      {/* Header — 49px with logo */}
      <header className="app-header">
        <span className="header-title">Activities</span>
        <div className="header-right">
          {dmaUser?.FullName && (
            <span className="dma-user-name">
              <span className="icon icon-sm" aria-hidden="true">person</span>
              {dmaUser.FullName}
            </span>
          )}
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
            onClick={() => isDataMinerHost() ? dmaSignOut() : instance.logoutRedirect()}
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
            disabled={t.id === 'subscriptions' && !subscriptionsAvailable}
            title={t.id === 'subscriptions' && !subscriptionsAvailable ? 'Subscriptions require a DataMiner connection' : undefined}
            onClick={() => setActiveTab(t.id)}
          >
            <span className="icon icon-sm" aria-hidden="true">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main className="app-main">
        <AuthGuard onDmaConnection={setDmaConnection}>
          {(currentUserId) => (
            <>
              {activeTab === 'new' && (
                <ActivityForm
                  currentUserId={currentUserId}
                  onNoteCreated={handleNoteCreated}
                  managedAccounts={managedAccounts}
                  tamLoading={tamLoading}
                />
              )}
              {activeTab === 'browse' && (
                <NotesList
                  refreshKey={refreshKey}
                  initialAccount={browseAccount}
                  managedAccounts={managedAccounts}
                  tamLoading={tamLoading}
                />
              )}
              {activeTab === 'subscriptions' && (
                <SubscriptionsPanel dmaAvailable={subscriptionsAvailable} />
              )}
            </>
          )}
        </AuthGuard>
      </main>
    </div>
  )
}
