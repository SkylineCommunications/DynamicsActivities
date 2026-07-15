import { useState } from 'react'
import { submitLead } from '../../api/leads'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Guard against oversized submissions producing oversized emails.
const MAX_FIELD_LENGTH = 2000

const initialState = {
  topic: '',
  firstName: '',
  lastName: '',
  company: '',
  jobTitle: '',
  email: '',
  phone: '',
  country: '',
  description: '',
}

/**
 * "Add lead" form. Collects lead details and submits them via the
 * DataMiner automation script, which emails the configured recipient.
 *
 * @param {{ onDone?: () => void }} props
 */
export default function LeadForm({ onDone }) {
  const [values, setValues] = useState(initialState)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [submitted, setSubmitted] = useState(false)

  function update(field) {
    return (e) => setValues((prev) => ({ ...prev, [field]: e.target.value.slice(0, MAX_FIELD_LENGTH) }))
  }

  function isValid() {
    return (
      values.topic.trim()
      && values.firstName.trim()
      && values.lastName.trim()
      && values.company.trim()
      && EMAIL_RE.test(values.email.trim())
    )
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!isValid() || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const payload = Object.fromEntries(
        Object.entries(values).map(([k, v]) => [k, v.trim()]),
      )
      await submitLead(payload)
      setSubmitted(true)
    } catch (err) {
      setError(err.message || 'Something went wrong while submitting the lead.')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="form-card">
        <div className="lead-success">
          <div className="auth-icon"><span className="icon icon-lg" aria-hidden="true">check_circle</span></div>
          <h2>Lead submitted</h2>
          <p>Thanks! Your lead has been sent and the team will follow up.</p>
          <div className="lead-form-actions">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => { setValues(initialState); setSubmitted(false) }}
            >
              <span className="icon icon-sm" aria-hidden="true">add</span> Add another lead
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
          Fill in the details below to submit a new lead. Fields marked with <span className="required">*</span> are required.
        </p>

        <div className="field">
          <label className="field-label" htmlFor="lead-topic">Topic <span className="required">*</span></label>
          <input id="lead-topic" className="input" type="text" value={values.topic} onChange={update('topic')} placeholder="e.g. Interested in DataMiner monitoring" required />
        </div>

        <div className="lead-form-grid">
          <div className="field">
            <label className="field-label" htmlFor="lead-first">First name <span className="required">*</span></label>
            <input id="lead-first" className="input" type="text" value={values.firstName} onChange={update('firstName')} autoComplete="given-name" required />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="lead-last">Last name <span className="required">*</span></label>
            <input id="lead-last" className="input" type="text" value={values.lastName} onChange={update('lastName')} autoComplete="family-name" required />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="lead-company">Company / Account <span className="required">*</span></label>
            <input id="lead-company" className="input" type="text" value={values.company} onChange={update('company')} autoComplete="organization" required />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="lead-job">Job title <span className="optional">(optional)</span></label>
            <input id="lead-job" className="input" type="text" value={values.jobTitle} onChange={update('jobTitle')} autoComplete="organization-title" />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="lead-email">Email <span className="required">*</span></label>
            <input id="lead-email" className="input" type="email" value={values.email} onChange={update('email')} autoComplete="email" required />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="lead-phone">Phone <span className="optional">(optional)</span></label>
            <input id="lead-phone" className="input" type="tel" value={values.phone} onChange={update('phone')} autoComplete="tel" />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="lead-country">Country <span className="optional">(optional)</span></label>
            <input id="lead-country" className="input" type="text" value={values.country} onChange={update('country')} autoComplete="country-name" />
          </div>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="lead-description">Description / Notes <span className="optional">(optional)</span></label>
          <textarea id="lead-description" className="textarea" value={values.description} onChange={update('description')} placeholder="Add any context that helps the team follow up…" />
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
              : (<><span className="icon icon-sm" aria-hidden="true">send</span> Add lead</>)}
          </button>
        </div>
      </form>
    </div>
  )
}
