import { useState } from 'react'
import { submitOpportunity } from '../../api/opportunities'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Guard against oversized submissions producing oversized emails.
const MAX_FIELD_LENGTH = 2000

const initialState = {
  topic: '',
  company: '',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  estimatedValue: '',
  estimatedCloseDate: '',
  country: '',
  description: '',
}

// Labels used in the confirmation summary, in display order.
const CONFIRM_FIELDS = {
  topic: 'Opportunity name',
  company: 'Company / Account',
  estimatedValue: 'Estimated value',
  firstName: 'Contact first name',
  lastName: 'Contact last name',
  email: 'Email',
  phone: 'Phone',
  estimatedCloseDate: 'Estimated close date',
  country: 'Country',
  description: 'Description',
}

/**
 * "Add opportunity" form. Collects opportunity details and submits them via the
 * DataMiner automation script, which emails the configured recipient.
 *
 * @param {{ onDone?: () => void }} props
 */
export default function OpportunityForm({ onDone }) {
  const [values, setValues] = useState(initialState)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  function update(field) {
    return (e) => setValues((prev) => ({ ...prev, [field]: e.target.value.slice(0, MAX_FIELD_LENGTH) }))
  }

  function isValid() {
    const email = values.email.trim()
    return (
      values.topic.trim()
      && values.company.trim()
      && (!email || EMAIL_RE.test(email))
    )
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!isValid() || submitting) return
    setError(null)
    setShowConfirm(true)
  }

  async function confirmSubmit() {
    setShowConfirm(false)
    setSubmitting(true)
    setError(null)
    try {
      const payload = Object.fromEntries(
        Object.entries(values).map(([k, v]) => [k, v.trim()]),
      )
      await submitOpportunity(payload)
      setSubmitted(true)
    } catch (err) {
      setError(err.message || 'Something went wrong while submitting the opportunity.')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="form-card">
        <div className="lead-success">
          <div className="auth-icon"><span className="icon icon-lg" aria-hidden="true">check_circle</span></div>
          <h2>Opportunity submitted</h2>
          <p>Thanks! Your opportunity has been sent and the team will follow up.</p>
          <div className="lead-form-actions">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => { setValues(initialState); setSubmitted(false) }}
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
            <input id="opp-company" className="input" type="text" value={values.company} onChange={update('company')} autoComplete="organization" required />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="opp-value">Estimated value <span className="optional">(optional)</span></label>
            <input id="opp-value" className="input" type="text" value={values.estimatedValue} onChange={update('estimatedValue')} placeholder="e.g. € 50,000" />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="opp-first">Contact first name <span className="optional">(optional)</span></label>
            <input id="opp-first" className="input" type="text" value={values.firstName} onChange={update('firstName')} autoComplete="given-name" />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="opp-last">Contact last name <span className="optional">(optional)</span></label>
            <input id="opp-last" className="input" type="text" value={values.lastName} onChange={update('lastName')} autoComplete="family-name" />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="opp-email">Email <span className="optional">(optional)</span></label>
            <input id="opp-email" className="input" type="email" value={values.email} onChange={update('email')} autoComplete="email" />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="opp-phone">Phone <span className="optional">(optional)</span></label>
            <input id="opp-phone" className="input" type="tel" value={values.phone} onChange={update('phone')} autoComplete="tel" />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="opp-close">Estimated close date <span className="optional">(optional)</span></label>
            <input id="opp-close" className="input" type="date" value={values.estimatedCloseDate} onChange={update('estimatedCloseDate')} />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="opp-country">Country <span className="optional">(optional)</span></label>
            <input id="opp-country" className="input" type="text" value={values.country} onChange={update('country')} autoComplete="country-name" />
          </div>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="opp-description">Description / Notes <span className="optional">(optional)</span></label>
          <textarea id="opp-description" className="textarea" value={values.description} onChange={update('description')} placeholder="Add any context that helps the team follow up…" />
        </div>

        {error && <p className="auth-error" role="alert">{error}</p>}

        <div className="lead-form-actions">
          {onDone && (
            <button type="button" className="btn btn-secondary" onClick={onDone} disabled={submitting}>
              Cancel
            </button>
          )}
          <button type="submit" className="btn-primary" disabled={!isValid() || submitting}>
            {submitting
              ? (<><span className="auth-spinner spinner-inline" aria-hidden="true" /> Sending…</>)
              : (<><span className="icon icon-sm" aria-hidden="true">send</span> Add opportunity</>)}
          </button>
        </div>
      </form>

      {showConfirm && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setShowConfirm(false)}
        >
          <div className="modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="opp-confirm-title">
            <div className="modal-header">
              <div className="modal-title-group">
                <span className="confirm-title-icon icon" aria-hidden="true">send</span>
                <h3 className="modal-title" id="opp-confirm-title">Confirm opportunity submission</h3>
              </div>
              <button type="button" className="modal-close" onClick={() => setShowConfirm(false)} aria-label="Close">
                <span className="icon">close</span>
              </button>
            </div>

            <div className="modal-body">
              <p className="confirm-intro">The following actions will be performed:</p>
              <ul className="confirm-actions">
                <li>Send the opportunity details below to the DataMiner automation script.</li>
                <li>The script emails the opportunity to the sales/team recipient for follow-up.</li>
              </ul>

              <div className="confirm-summary">
                <div className="confirm-summary-title">Opportunity summary</div>
                {Object.entries(CONFIRM_FIELDS)
                  .filter(([key]) => values[key].trim())
                  .map(([key, label]) => (
                    <div className="confirm-summary-row" key={key}>
                      <span className="confirm-summary-label">{label}</span>
                      <span className="confirm-summary-value">{values[key].trim()}</span>
                    </div>
                  ))}
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowConfirm(false)}>
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={confirmSubmit}>
                <span className="icon icon-sm" aria-hidden="true">send</span> Confirm &amp; send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
