import { useState, useEffect, useCallback } from 'react'
import { useMsal } from '@azure/msal-react'
import { getSubscriptions, deleteSubscription, updateSubscription } from '../api/subscriptions'
import SubscriptionForm from './SubscriptionForm'

const FREQ_LABELS = {
  instant: 'Instant',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
}

const FREQ_ICONS = {
  instant: 'bolt',
  daily: 'calendar_today',
  weekly: 'calendar_view_week',
  monthly: 'calendar_month',
}

const SCOPE_ICONS = {
  account: 'apartment',
  country: 'public',
  region: 'location_on',
  escalation: 'flag',
}

const TYPE_ICONS = {
  phonecalls: 'contact_phone',
  appointments: 'calendar_today',
  emails: 'mail',
  slc_escalations: 'warning',
  annotations: 'edit_note',
}

function fmtDate(d) {
  if (!d) return 'Never'
  return new Date(d).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function SubscriptionCard({ sub, onEdit, onDelete, onToggle }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [toggling, setToggling] = useState(false)

  async function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setDeleting(true)
    try {
      await onDelete(sub.id)
    } catch {
      setDeleting(false)
    }
  }

  async function handleToggle() {
    setToggling(true)
    await onToggle(sub.id, !sub.enabled)
    setToggling(false)
  }

  return (
    <div className={`sub-card${sub.enabled === false ? ' sub-card-disabled' : ''}`}>
      <div className="sub-card-header">
        <div className="sub-card-scope">
          <button
            type="button"
            className={`sub-toggle${sub.enabled !== false ? ' sub-toggle-on' : ''}`}
            onClick={handleToggle}
            disabled={toggling}
            title={sub.enabled !== false ? 'Pause subscription' : 'Resume subscription'}
          >
            <span className="sub-toggle-track">
              <span className="sub-toggle-thumb" />
            </span>
          </button>
          <span className="icon sub-scope-icon">{SCOPE_ICONS[sub.scopeType] ?? 'bookmark'}</span>
          <span className="sub-scope-label">{sub.scopeLabel || 'All Escalations'}</span>
          <span className="sub-scope-type">{sub.scopeType}</span>
          {sub.enabled === false && <span className="sub-paused-label">Paused</span>}
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
                <span className="icon icon-sm">edit</span> Edit
              </button>
              <button type="button" className="btn-card-action btn-delete" onClick={handleDelete} title="Delete subscription">
                <span className="icon icon-sm">delete</span>
              </button>
            </>
          )}
        </div>
      </div>
      <div className="sub-card-meta">
        <span className="sub-freq-badge">
          <span className="icon icon-sm">{FREQ_ICONS[sub.frequency] ?? 'schedule'}</span>
          {FREQ_LABELS[sub.frequency] ?? sub.frequency}
        </span>
        {sub.activityTypes && sub.activityTypes.length < 5 && (
          <span className="sub-types-badge">
            {sub.activityTypes.map((t) => (
              <span key={t} className="icon icon-sm" title={t}>{TYPE_ICONS[t] ?? 'description'}</span>
            ))}
          </span>
        )}
        <span className="sub-last-sent">Last sent: {fmtDate(sub.lastSentAt)}</span>
      </div>
    </div>
  )
}

export default function SubscriptionsPanel({ dmaAvailable = true }) {
  const { instance } = useMsal()
  const [subs, setSubs] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editingSub, setEditingSub] = useState(null)

  const load = useCallback(() => {
    if (!dmaAvailable) {
      setLoading(false)
      setSubs([])
      setError('DataMiner connection unavailable. Subscriptions are disabled in this session.')
      return
    }

    setLoading(true)
    setError(null)
    getSubscriptions(instance)
      .then(setSubs)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [instance, dmaAvailable])

  useEffect(() => { load() }, [load])

  async function handleDelete(id) {
    try {
      await deleteSubscription(instance, id)
      setSubs((prev) => prev.filter((s) => s.id !== id))
    } catch (e) {
      setError(e.message)
      throw e
    }
  }

  async function handleToggle(id, enabled) {
    try {
      await updateSubscription(instance, id, { enabled })
      setSubs((prev) => prev.map((s) => (s.id === id ? { ...s, enabled } : s)))
    } catch (e) {
      setError(e.message)
    }
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
        <div className="bp-icon"><span className="icon" style={{fontSize:'20px',color:'var(--palette-color5)'}}>lightbulb</span></div>
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
          <span className="icon icon-sm">add</span> New Subscription
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
          <div className="empty-icon"><span className="icon" style={{fontSize:'32px'}}>notifications</span></div>
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
              onToggle={handleToggle}
            />
          ))}
        </div>
      )}
    </div>
  )
}
