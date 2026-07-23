import { useState, useEffect } from 'react'
import { useMsal } from '@azure/msal-react'
import { navigate } from '../../hooks/useHashRoute'

/**
 * Review page for lead submissions from Team members.
 * Decodes the lead data from the URL, shows a read-only preview, and provides
 * a "Save to Dynamics" button for users with full Dynamics licenses.
 */
export default function LeadReview() {
  const { accounts } = useMsal()
  const [leadData, setLeadData] = useState(null)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.hash.split('?')[1])
      const encoded = params.get('data')
      if (!encoded) {
        setError('Missing lead data in URL')
        return
      }
      const decoded = JSON.parse(atob(encoded))
      setLeadData(decoded)
    } catch (err) {
      setError('Invalid or corrupted lead data')
      console.error('Failed to decode lead data:', err)
    }
  }, [])

  async function handleSave() {
    setSaving(true)
    setError(null)
    
    try {
      // TODO: Replace this with actual API call to save to Dynamics
      await new Promise(resolve => setTimeout(resolve, 1000))
      alert('TEST: Lead would be saved to Dynamics here!\n\nData:\n' + JSON.stringify(leadData, null, 2))
      
      // On success, navigate back to main app
      navigate('')
    } catch (err) {
      setError(err.message || 'Failed to save lead')
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
          <h2>Unable to load lead</h2>
          <p>{error}</p>
          <button type="button" className="btn-primary" onClick={() => navigate('')}>
            Return to app
          </button>
        </div>
      </div>
    )
  }

  if (!leadData) {
    return (
      <div className="form-card">
        <div className="loading-state">
          <div className="spinner" />
          <p>Loading lead data...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="form-card">
      <div className="review-header">
        <h2>Review lead submission</h2>
        <p className="hint-text">
          Review the lead details below. Click "Save to Dynamics" to create this lead in your CRM.
        </p>
      </div>

      <div className="review-fields">
        {leadData.topic && (
          <div className="review-field">
            <label className="review-field-label">Topic</label>
            <div className="review-field-value">{leadData.topic}</div>
          </div>
        )}
        
        {(leadData.firstName || leadData.lastName) && (
          <div className="review-field">
            <label className="review-field-label">Name</label>
            <div className="review-field-value">
              {[leadData.firstName, leadData.lastName].filter(Boolean).join(' ')}
            </div>
          </div>
        )}

        {leadData.company && (
          <div className="review-field">
            <label className="review-field-label">Company / Account</label>
            <div className="review-field-value">{leadData.company}</div>
          </div>
        )}

        {leadData.jobTitle && (
          <div className="review-field">
            <label className="review-field-label">Job title</label>
            <div className="review-field-value">{leadData.jobTitle}</div>
          </div>
        )}

        {leadData.email && (
          <div className="review-field">
            <label className="review-field-label">Email</label>
            <div className="review-field-value">{leadData.email}</div>
          </div>
        )}

        {leadData.phone && (
          <div className="review-field">
            <label className="review-field-label">Phone</label>
            <div className="review-field-value">{leadData.phone}</div>
          </div>
        )}

        {leadData.country && (
          <div className="review-field">
            <label className="review-field-label">Country</label>
            <div className="review-field-value">{leadData.country}</div>
          </div>
        )}

        {leadData.description && (
          <div className="review-field">
            <label className="review-field-label">Description</label>
            <div className="review-field-value review-field-multiline">{leadData.description}</div>
          </div>
        )}

        {leadData.submittedBy && (
          <div className="review-field">
            <label className="review-field-label">Submitted by</label>
            <div className="review-field-value">{leadData.submittedBy}</div>
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
