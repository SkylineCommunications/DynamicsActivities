import { useState, useEffect } from 'react'
import { useMsal } from '@azure/msal-react'
import { navigate } from '../../hooks/useHashRoute'

/**
 * Review page for opportunity submissions from Team members.
 * Decodes the opportunity data from the URL, shows a read-only preview, and provides
 * a "Save to Dynamics" button for users with full Dynamics licenses.
 */
export default function OpportunityReview() {
  const { accounts } = useMsal()
  const [opportunityData, setOpportunityData] = useState(null)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.hash.split('?')[1])
      const encoded = params.get('data')
      if (!encoded) {
        setError('Missing opportunity data in URL')
        return
      }
      const decoded = JSON.parse(atob(encoded))
      setOpportunityData(decoded)
    } catch (err) {
      setError('Invalid or corrupted opportunity data')
      console.error('Failed to decode opportunity data:', err)
    }
  }, [])

  async function handleSave() {
    setSaving(true)
    setError(null)
    
    try {
      // TODO: Replace this with actual API call to save to Dynamics
      await new Promise(resolve => setTimeout(resolve, 1000))
      alert('TEST: Opportunity would be saved to Dynamics here!\n\nData:\n' + JSON.stringify(opportunityData, null, 2))
      
      // On success, navigate back to main app
      navigate('')
    } catch (err) {
      setError(err.message || 'Failed to save opportunity')
      setSaving(false)
    }
  }

  if (error) {
    return (
      <div className="form-card">
        <div className="auth-error-container">
          <div className="auth-icon">
            <span className="icon icon-lg" aria-hidden="true">error</span>
          </div>
          <h2>Unable to load opportunity</h2>
          <p>{error}</p>
          <button type="button" className="btn-primary" onClick={() => navigate('')}>
            Return to app
          </button>
        </div>
      </div>
    )
  }

  if (!opportunityData) {
    return (
      <div className="form-card">
        <div className="loading-state">
          <div className="spinner" />
          <p>Loading opportunity data...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="form-card">
      <div className="review-header">
        <h2>Review opportunity submission</h2>
        <p className="hint-text">
          Review the opportunity details below. Click "Save to Dynamics" to create this opportunity in your CRM.
        </p>
      </div>

      <div className="review-fields">
        {opportunityData.topic && (
          <div className="review-field">
            <label className="review-field-label">Opportunity name</label>
            <div className="review-field-value">{opportunityData.topic}</div>
          </div>
        )}

        {opportunityData.company && (
          <div className="review-field">
            <label className="review-field-label">Company / Account</label>
            <div className="review-field-value">{opportunityData.company}</div>
          </div>
        )}

        {opportunityData.estimatedValue && (
          <div className="review-field">
            <label className="review-field-label">Estimated value</label>
            <div className="review-field-value">{opportunityData.estimatedValue}</div>
          </div>
        )}

        {(opportunityData.firstName || opportunityData.lastName) && (
          <div className="review-field">
            <label className="review-field-label">Contact name</label>
            <div className="review-field-value">
              {[opportunityData.firstName, opportunityData.lastName].filter(Boolean).join(' ')}
            </div>
          </div>
        )}

        {opportunityData.email && (
          <div className="review-field">
            <label className="review-field-label">Email</label>
            <div className="review-field-value">{opportunityData.email}</div>
          </div>
        )}

        {opportunityData.phone && (
          <div className="review-field">
            <label className="review-field-label">Phone</label>
            <div className="review-field-value">{opportunityData.phone}</div>
          </div>
        )}

        {opportunityData.estimatedCloseDate && (
          <div className="review-field">
            <label className="review-field-label">Estimated close date</label>
            <div className="review-field-value">{opportunityData.estimatedCloseDate}</div>
          </div>
        )}

        {opportunityData.country && (
          <div className="review-field">
            <label className="review-field-label">Country</label>
            <div className="review-field-value">{opportunityData.country}</div>
          </div>
        )}

        {opportunityData.description && (
          <div className="review-field">
            <label className="review-field-label">Description</label>
            <div className="review-field-value review-field-multiline">{opportunityData.description}</div>
          </div>
        )}

        {opportunityData.submittedBy && (
          <div className="review-field">
            <label className="review-field-label">Submitted by</label>
            <div className="review-field-value">{opportunityData.submittedBy}</div>
          </div>
        )}
      </div>

      {error && <p className="auth-error" role="alert">{error}</p>}

      <div className="lead-form-actions">
        <button 
          type="button" 
          className="btn btn-secondary" 
          onClick={() => navigate('')}
          disabled={saving}
        >
          Cancel
        </button>
        <button 
          type="button" 
          className="btn-primary" 
          onClick={handleSave}
          disabled={saving}
        >
          <span className="icon icon-sm" aria-hidden="true">save</span>
          {saving ? 'Saving...' : 'Save to Dynamics'}
        </button>
      </div>
    </div>
  )
}
