import { useState, useEffect, useCallback } from 'react'
import { useMsal } from '@azure/msal-react'
import { getSubscriptions, deleteSubscription } from '../api/subscriptions'
import SubscriptionForm from './SubscriptionForm'

const FREQ_LABELS = {
  instant: '⚡ Instant',
  daily: '📅 Daily',
  weekly: '📆 Weekly',
  monthly: '🗓 Monthly',
}

const SCOPE_ICONS = {
  account: '🏢',
  country: '🌍',
  region: '📍',
  escalation: '🚨',
}

function fmtDate(d) {
  if (!d) return 'Never'
  return new Date(d).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function SubscriptionCard({ sub, onEdit, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setDeleting(true)
    await onDelete(sub.id)
  }

  return (
    <div className="sub-card">
      <div className="sub-card-header">
        <div className="sub-card-scope">
          <span className="sub-scope-icon">{SCOPE_ICONS[sub.scopeType] ?? '📌'}</span>
          <span className="sub-scope-label">{sub.scopeLabel || 'All Escalations'}</span>
          <span className="sub-scope-type">{sub.scopeType}</span>
        </div>
        <div className="sub-card-actions">
          {confirmDelete ? (
            <>
              <button
                type="button"
                className="btn-card-action btn-confirm-delete"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? 'Deleting…' : 'Confirm'}
              </button>
              <button
                type="button"
                className="btn-card-action btn-cancel"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn-card-action btn-open" onClick={() => onEdit(sub)}>
                Edit
              </button>
              <button type="button" className="btn-card-action btn-delete" onClick={handleDelete} title="Delete subscription">
                🗑
              </button>
            </>
          )}
        </div>
      </div>
      <div className="sub-card-meta">
        <span className="sub-freq-badge">{FREQ_LABELS[sub.frequency] ?? sub.frequency}</span>
        <span className="sub-last-sent">Last sent: {fmtDate(sub.lastSentAt)}</span>
      </div>
    </div>
  )
}

export default function SubscriptionsPanel() {
  const { instance } = useMsal()
  const [subs, setSubs] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editingSub, setEditingSub] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    getSubscriptions(instance)
      .then(setSubs)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [instance])

  useEffect(() => { load() }, [load])

  async function handleDelete(id) {
    await deleteSubscription(instance, id).catch((e) => setError(e.message))
    setSubs((prev) => prev.filter((s) => s.id !== id))
  }

  function handleEdit(sub) {
    setEditingSub(sub)
    setShowForm(true)
  }

  function handleSaved(saved) {
    setShowForm(false)
    setEditingSub(null)
    if (editingSub) {
      setSubs((prev) => prev.map((s) => (s.id === saved.id ? saved : s)))
    } else {
      setSubs((prev) => [...(prev ?? []), saved])
    }
  }

  function handleCancel() {
    setShowForm(false)
    setEditingSub(null)
  }

  return (
    <div className="subscriptions-container">
      {/* Best practice banner */}
      <div className="best-practice-banner">
        <div className="bp-icon">💡</div>
        <div>
          <strong>Recommended:</strong> Use <em>Instant</em> or <em>Daily</em> for accounts you're directly involved with.
          For broader interests (countries, regions), <em>Weekly</em> or <em>Monthly</em> prevents email overload.
        </div>
      </div>

      <div className="subscriptions-header">
        <h2 className="subscriptions-title">My Subscriptions</h2>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => { setEditingSub(null); setShowForm(true) }}
          disabled={showForm}
        >
          + New Subscription
        </button>
      </div>

      {showForm && (
        <SubscriptionForm
          subscription={editingSub}
          onSaved={handleSaved}
          onCancel={handleCancel}
        />
      )}

      {error && <div className="alert alert-error">{error}</div>}
      {loading && <div className="loading-text">Loading subscriptions…</div>}

      {!loading && subs !== null && subs.length === 0 && !showForm && (
        <div className="empty-state">
          <div className="empty-icon">🔔</div>
          <div className="empty-title">No subscriptions yet</div>
          <div className="empty-sub">Subscribe to accounts, countries, or regions to receive email notifications about new activities.</div>
        </div>
      )}

      {subs && subs.length > 0 && (
        <div className="sub-list">
          {subs.map((sub) => (
            <SubscriptionCard
              key={sub.id}
              sub={sub}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}
