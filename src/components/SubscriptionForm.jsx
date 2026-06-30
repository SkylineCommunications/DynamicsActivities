import { useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { searchAccounts, searchCountries, searchRegions } from '../api/dataverse'
import { createSubscription, updateSubscription } from '../api/subscriptions'
import AutocompletePicker from './AutocompletePicker'

const SCOPE_TYPES = [
  { value: 'account', icon: 'apartment', label: 'Account' },
  { value: 'country', icon: 'public', label: 'Country' },
  { value: 'region', icon: 'location_on', label: 'Region' },
  { value: 'escalation', icon: 'flag', label: 'Escalation' },
]

const FREQUENCIES = [
  { value: 'instant', icon: 'bolt', label: 'Instant', hint: 'Sent within minutes of a new activity (with a 15-min burst guard).' },
  { value: 'daily', icon: 'calendar_today', label: 'Daily', hint: 'One summary email per day (06:00 UTC).' },
  { value: 'weekly', icon: 'calendar_view_week', label: 'Weekly', hint: 'One summary email per week (Monday 07:00 UTC).' },
  { value: 'monthly', icon: 'calendar_month', label: 'Monthly', hint: 'One summary email per month (1st at 08:00 UTC).' },
]

function BestPracticeHint({ scopeType, frequency }) {
  if (!scopeType || !frequency) return null

  const isDirectScope = scopeType === 'account'
  const isFastFreq = frequency === 'instant' || frequency === 'daily'
  const isSlowFreq = frequency === 'weekly' || frequency === 'monthly'

  if (isDirectScope && isFastFreq) {
    return (
      <div className="best-practice-hint hint-good">
        <span className="icon icon-sm" style={{color:'var(--success)'}}>check_circle</span> Good choice — Instant or Daily works well for accounts you're directly involved with.
      </div>
    )
  }
  if (isDirectScope && isSlowFreq) {
    return (
      <div className="best-practice-hint hint-tip">
        <span className="icon icon-sm" style={{color:'var(--palette-color5)'}}>lightbulb</span> Tip: For accounts you work with closely, Daily or Instant keeps you more up-to-date.
      </div>
    )
  }
  if (!isDirectScope && isSlowFreq) {
    return (
      <div className="best-practice-hint hint-good">
        <span className="icon icon-sm" style={{color:'var(--success)'}}>check_circle</span> Good choice — Weekly or Monthly is ideal for broader country or region monitoring.
      </div>
    )
  }
  if (!isDirectScope && isFastFreq) {
    return (
      <div className="best-practice-hint hint-tip">
        <span className="icon icon-sm" style={{color:'var(--palette-color5)'}}>lightbulb</span> Tip: For broad scopes (countries/regions), Weekly or Monthly avoids email overload.
      </div>
    )
  }
  return null
}

/**
 * Form for creating or editing a subscription.
 * @param {{ subscription?: object, onSaved: (sub) => void, onCancel: () => void }} props
 */
export default function SubscriptionForm({ subscription, onSaved, onCancel }) {
  const { instance } = useMsal()
  const editing = !!subscription

  const [scopeType, setScopeType] = useState(subscription?.scopeType ?? 'account')
  const [frequency, setFrequency] = useState(subscription?.frequency ?? 'daily')
  const [account, setAccount] = useState(
    subscription?.scopeType === 'account'
      ? { accountid: subscription.scopeValue, name: subscription.scopeLabel }
      : null,
  )
  const [countryInput, setCountryInput] = useState(
    subscription?.scopeType === 'country' ? { id: subscription.scopeValue, name: subscription.scopeValue } : null,
  )
  const [regionInput, setRegionInput] = useState(
    subscription?.scopeType === 'region' ? { id: subscription.scopeValue, name: subscription.scopeValue } : null,
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const selectedFreq = FREQUENCIES.find((f) => f.value === frequency)

  function getScopeValue() {
    if (scopeType === 'account') return account?.accountid ?? ''
    if (scopeType === 'country') return countryInput?.id ?? ''
    if (scopeType === 'region') return regionInput?.id ?? ''
    return '' // escalation has no value
  }

  function getScopeLabel() {
    if (scopeType === 'account') return account?.name ?? ''
    if (scopeType === 'country') return countryInput?.name ?? ''
    if (scopeType === 'region') return regionInput?.name ?? ''
    return 'All Escalations'
  }

  function isValid() {
    if (scopeType === 'account') return !!account?.accountid
    if (scopeType === 'country') return !!countryInput?.id
    if (scopeType === 'region') return !!regionInput?.id
    return true // escalation
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!isValid()) return
    setSaving(true)
    setError(null)
    try {
      const payload = {
        scopeType,
        scopeValue: getScopeValue(),
        scopeLabel: getScopeLabel(),
        frequency,
      }
      let saved
      if (editing) {
        saved = await updateSubscription(instance, subscription.id, payload)
        saved = { ...subscription, ...saved }
      } else {
        saved = await createSubscription(instance, payload)
      }
      onSaved(saved)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="subscription-form" onSubmit={handleSubmit} noValidate>
      <div className="sub-form-title">{editing ? 'Edit Subscription' : 'New Subscription'}</div>

      {/* Scope type */}
      <div className="field">
        <label className="field-label">Scope Type</label>
        <div className="filter-type-btns">
          {SCOPE_TYPES.map((s) => (
            <button
              key={s.value}
              type="button"
              className={`filter-type-btn ${scopeType === s.value ? 'active' : ''}`}
              onClick={() => setScopeType(s.value)}
            >
              <span className="icon icon-sm">{s.icon}</span> {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scope value */}
      {scopeType === 'account' && (
        <div className="field">
          <label className="field-label">Account <span className="required">*</span></label>
          <AutocompletePicker
            searchFn={(q) => searchAccounts(instance, q)}
            getKey={(a) => a.accountid}
            getLabel={(a) => a.name}
            getSublabel={(a) => [a.address1_country, a.address1_stateorprovince].filter(Boolean).join(' · ')}
            value={account}
            onChange={setAccount}
            placeholder="Search accounts…"
            autoSelectSingle
          />
        </div>
      )}
      {scopeType === 'country' && (
        <div className="field">
          <label className="field-label">Country <span className="required">*</span></label>
          <AutocompletePicker
            searchFn={(q) => searchCountries(instance, q)}
            getKey={(c) => c.id}
            getLabel={(c) => c.name}
            value={countryInput}
            onChange={setCountryInput}
            placeholder="Type to search countries…"
          />
          <div className="hint-text">Matches the country field on Account records in Dynamics.</div>
        </div>
      )}
      {scopeType === 'region' && (
        <div className="field">
          <label className="field-label">Region / State <span className="required">*</span></label>
          <AutocompletePicker
            searchFn={(q) => searchRegions(instance, q)}
            getKey={(r) => r.id}
            getLabel={(r) => r.name}
            value={regionInput}
            onChange={setRegionInput}
            placeholder="Type to search regions…"
          />
          <div className="hint-text">Matches the state/province field on Account records in Dynamics.</div>
        </div>
      )}
      {scopeType === 'escalation' && (
        <div className="hint-text">
          You will be notified about <strong>all</strong> escalation activities, regardless of account.
        </div>
      )}

      {/* Frequency */}
      <div className="field">
        <label className="field-label">Notification Frequency</label>
        <div className="filter-type-btns">
          {FREQUENCIES.map((f) => (
            <button
              key={f.value}
              type="button"
              className={`filter-type-btn ${frequency === f.value ? 'active' : ''}`}
              onClick={() => setFrequency(f.value)}
            >
              <span className="icon icon-sm">{f.icon}</span> {f.label}
            </button>
          ))}
        </div>
        {selectedFreq && <div className="hint-text" style={{ marginTop: 6 }}>{selectedFreq.hint}</div>}
      </div>

      {/* Best-practice hint */}
      <BestPracticeHint scopeType={scopeType} frequency={frequency} />

      {error && <div className="alert alert-error">{error}</div>}

      <div className="sub-form-actions">
        <button type="submit" className="btn btn-primary" disabled={!isValid() || saving}>
          {saving ? 'Saving…' : editing ? 'Save Changes' : 'Subscribe'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  )
}
