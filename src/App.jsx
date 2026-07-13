import { useState, useEffect } from 'react'
import { useMsal } from '@azure/msal-react'
import AuthGuard from './components/AuthGuard'
import NotesList from './components/NotesList'
import useTamContext from './hooks/useTamContext'
import SubscriptionsPanel from './components/SubscriptionsPanel'
import { signOut as dmaSignOut, isDataMinerHost, getDmaUser, redirectToAuth } from './api/dataminer'

const TABS = [
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

function buildBugReportUrl({ activeTab, reporter }) {
  const tabLabel = TABS.find((tab) => tab.id === activeTab)?.label ?? activeTab
  const timestamp = new Date().toISOString()
  const issueBody = [
    '## Problem',
    '<Describe what happened and why it is a bug.>',
    '',
    '## Steps to reproduce',
    '1. <Step 1>',
    '2. <Step 2>',
    '',
    '## Expected behavior',
    '<What should happen?>',
    '',
    '## Additional context',
    '<Any logs, screenshots, or details>',
    '',
    '---',
    '### Auto-captured context',
    `- Active tab: ${tabLabel}`,
    `- App URL: ${window.location.href}`,
    `- Browser: ${navigator.userAgent}`,
    `- Reporter: ${reporter || 'Unknown user'}`,
    `- Timestamp: ${timestamp}`,
    `- App version: ${import.meta.env.VITE_APP_VERSION || 'unknown'}`,
  ].join('\n')

  const params = new URLSearchParams({
    labels: 'bug',
    body: issueBody,
  })

  return `https://github.com/SkylineCommunications/DynamicsActivities/issues/new?${params.toString()}`
}

export default function App() {
  const { instance, accounts } = useMsal()
  const { managedAccounts, loading: tamLoading } = useTamContext()
  const [activeTab, setActiveTab] = useState('browse')
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
  const reporterName = dmaUser?.FullName || accounts?.[0]?.name || accounts?.[0]?.username || ''

  function openBugReport() {
    const url = buildBugReportUrl({ activeTab, reporter: reporterName })
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <AuthGuard onDmaConnection={setDmaConnection}>
      {() => (
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
                className="bug-report-btn"
                onClick={openBugReport}
                title="Report a bug"
                aria-label="Report a bug"
              >
                <span className="icon" aria-hidden="true">bug_report</span>
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
                title={t.id === 'subscriptions' && !subscriptionsAvailable ? 'DataMiner sign-in required for subscriptions' : undefined}
                onClick={() => setActiveTab(t.id)}
              >
                <span className="icon icon-sm" aria-hidden="true">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </nav>

          {/* Content */}
          <main className="app-main">
            <>
              {activeTab === 'browse' && (
                <NotesList
                  refreshKey={0}
                  initialAccount={null}
                  managedAccounts={managedAccounts}
                  tamLoading={tamLoading}
                />
              )}
              {activeTab === 'subscriptions' && (
                <SubscriptionsPanel dmaAvailable={subscriptionsAvailable} onReconnectDma={redirectToAuth} />
              )}
            </>
          </main>
        </div>
      )}
    </AuthGuard>
  )
}
