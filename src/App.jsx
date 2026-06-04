import { useState } from 'react'
import AuthGuard from './components/AuthGuard'
import QuickNoteForm from './components/QuickNoteForm'
import NotesList from './components/NotesList'

const TABS = [
  { id: 'new', label: '+ New Note' },
  { id: 'browse', label: '📋 Browse' },
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
          <span className="tab-brand-name">Quicknotes</span>
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
                <QuickNoteForm
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
