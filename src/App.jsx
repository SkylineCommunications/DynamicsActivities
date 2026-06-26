import { useState } from 'react'
import AuthGuard from './components/AuthGuard'
import ActivityForm from './components/ActivityForm'
import NotesList from './components/NotesList'
import SubscriptionsPanel from './components/SubscriptionsPanel'

const TABS = [
  { id: 'new', label: '+ New Activity' },
  { id: 'browse', label: '📋 Browse' },
  { id: 'subscriptions', label: '🔔 Subscriptions' },
]

export default function App() {
  const [activeTab, setActiveTab] = useState('new')
  const [refreshKey, setRefreshKey] = useState(0)

  function handleNoteCreated() {
    setRefreshKey((k) => k + 1)
    setActiveTab('browse')
  }

  return (
    <div className="app">
      {/* Tab nav */}
      <nav className="tab-nav">
        <div className="tab-brand">
          <span className="tab-brand-icon">⚡</span>
          <span className="tab-brand-name">Activities</span>
        </div>
        <div className="tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`tab-btn ${activeTab === t.id ? 'active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
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
              {activeTab === 'subscriptions' && (
                <SubscriptionsPanel />
              )}
            </>
          )}
        </AuthGuard>
      </main>
    </div>
  )
}
