import { useRef, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { submitOpportunity } from '../../api/opportunities'
import { searchAccounts } from '../../api/dataverse'
import AutocompletePicker from '../AutocompletePicker'

// Guard against oversized submissions producing oversized emails.
const MAX_FIELD_LENGTH = 2000

const initialState = {
  topic: '',
  company: '',
  accountId: '',
  estimatedValue: '',
  estimatedCloseDate: '',
  description: '',
}

/**
 * "Add opportunity" form. Collects opportunity details and opens the user's email
 * client with the details prefilled so they can review and send it to the sales team.
 *
 * @param {{ onDone?: () => void }} props
 */
export default function OpportunityForm({ onDone }) {
  const { instance } = useMsal()
  const [values, setValues] = useState(initialState)
  const [error, setError] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  // Synchronous guard: prevents a fast double-click (or Enter + click) from opening
  // the email draft more than once before React re-renders to the success screen.
  const submittingRef = useRef(false)
  // Bumped to remount the account picker so its internal input resets on "add another".
  const [resetKey, setResetKey] = useState(0)

  function update(field) {
    return (e) => setValues((prev) => ({ ...prev, [field]: e.target.value.slice(0, MAX_FIELD_LENGTH) }))
  }

  function setCompany(name, accountId = '') {
    setValues((prev) => ({ ...prev, company: (name || '').slice(0, MAX_FIELD_LENGTH), accountId }))
  }

  function isValid() {
    return (
      values.topic.trim()
      && values.company.trim()
    )
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (submittingRef.current) return
    if (!isValid()) return
    submittingRef.current = true
    setError(null)
    try {
      const payload = Object.fromEntries(
        Object.entries(values).map(([k, v]) => [k, v.trim()]),
      )
      submitOpportunity(payload)
      setSubmitted(true)
    } catch (err) {
      submittingRef.current = false
      setError(err.message || 'Something went wrong while opening the opportunity email.')
    }
  }

  if (submitted) {
    return (
      <div className="form-card">
        <div className="lead-success">
          <div className="auth-icon"><span className="icon icon-lg" aria-hidden="true">check_circle</span></div>
          <h2>Email ready to send</h2>
          <p>Your email app should have opened with the opportunity details. Review the message and hit send to submit the opportunity.</p>
          <div className="lead-form-actions">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => { setValues(initialState); setSubmitted(false); submittingRef.current = false; setResetKey((k) => k + 1) }}
            >
              <span className="icon icon-sm" aria-hidden="true">add</span> Add another opportunity
            </button>
            {onDone && (
              <button type="button" className="btn-primary" onClick={onDone}>
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="form-card">
      <form onSubmit={handleSubmit} noValidate>
        <p className="hint-text">
          Fill in the details below to submit a new opportunity. Fields marked with <span className="required">*</span> are required.
        </p>

        <div className="field">
          <label className="field-label" htmlFor="opp-topic">Opportunity name <span className="required">*</span></label>
          <input id="opp-topic" className="input" type="text" value={values.topic} onChange={update('topic')} placeholder="e.g. DataMiner monitoring rollout" required />
        </div>

        <div className="lead-form-grid">
          <div className="field">
            <label className="field-label" htmlFor="opp-company">Company / Account <span className="required">*</span></label>
            <AutocompletePicker
              key={resetKey}
              searchFn={(q) => searchAccounts(instance, q)}
              getKey={(a) => a.accountid}
              getLabel={(a) => a.name}
              getSublabel={(a) => a.address1_country}
              value={null}
              onChange={(item) => { if (item) setCompany(item.name, item.accountid) }}
              onQueryChange={(name) => setCompany(name, '')}
              placeholder="Search or type a company / account…"
              minChars={2}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="opp-value">Estimated value <span className="optional">(optional)</span></label>
            <input id="opp-value" className="input" type="text" value={values.estimatedValue} onChange={update('estimatedValue')} placeholder="e.g. € 50,000" />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="opp-close">Estimated close date <span className="optional">(optional)</span></label>
            <input id="opp-close" className="input" type="date" value={values.estimatedCloseDate} onChange={update('estimatedCloseDate')} />
          </div>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="opp-description">Description / Notes <span className="optional">(optional)</span></label>
          <textarea id="opp-description" className="textarea" value={values.description} onChange={update('description')} placeholder="Add any context that helps the team follow up…" />
        </div>

        {error && <p className="auth-error" role="alert">{error}</p>}

        <div className="lead-form-actions">
          {onDone && (
            <button type="button" className="btn btn-secondary" onClick={onDone}>
              Cancel
            </button>
          )}
          <button type="submit" className="btn-primary" disabled={!isValid()}>
            <span className="icon icon-sm" aria-hidden="true">send</span> Add opportunity
          </button>
        </div>
      </form>
    </div>
  )
}
