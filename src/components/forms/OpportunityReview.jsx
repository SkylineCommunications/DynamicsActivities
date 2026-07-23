import { useState, useEffect } from 'react'
import { useMsal } from '@azure/msal-react'
import { navigate } from '../../hooks/useHashRoute'
import Modal from '../Modal'
import { decodeReviewData } from '../../api/mailto'

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
  const [showPreview, setShowPreview] = useState(false)
  const [showAccountPreview, setShowAccountPreview] = useState(false)

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.hash.split('?')[1])
      const encoded = params.get('data')
      if (!encoded) {
        setError('Missing opportunity data in URL')
        return
      }
      const decoded = decodeReviewData(encoded)
      setOpportunityData(decoded)
    } catch (err) {
      setError('Invalid or corrupted opportunity data')
      console.error('Failed to decode opportunity data:', err)
    }
  }, [])

  function buildApiCall() {
    const BASE_URL = import.meta.env.VITE_DATAVERSE_URL?.replace(/\/$/, '') || 'https://yourorg.crm.dynamics.com'
    const API = `${BASE_URL}/api/data/v9.2`

    // Build the opportunity payload according to Dynamics schema
    const payload = {
      name: opportunityData.topic || 'Untitled Opportunity',
      description: opportunityData.description || '',
      estimatedvalue: opportunityData.estimatedValue ? parseFloat(opportunityData.estimatedValue) : null,
      estimatedclosedate: opportunityData.estimatedCloseDate || null,
      
      // Opportunity defaults
      opportunityratingcode: 2, // Hot (1=Cold, 2=Warm, 3=Hot)
      salesstage: 0, // Qualify
    }

    // Add account link if we have the GUID
    if (opportunityData.accountId) {
      payload['parentaccountid@odata.bind'] = `/accounts(${opportunityData.accountId})`
    }

    // Remove null/empty values
    Object.keys(payload).forEach(key => {
      if (payload[key] === null || payload[key] === '') delete payload[key]
    })

    return {
      url: `${API}/opportunities`,
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': 'Bearer <TOKEN>',
        'Prefer': 'return=representation'
      },
      body: payload,
      hasAccountGuid: Boolean(opportunityData.accountId),
    }
  }

  function buildAccountApiCall() {
    const BASE_URL = import.meta.env.VITE_DATAVERSE_URL?.replace(/\/$/, '') || 'https://yourorg.crm.dynamics.com'
    const API = `${BASE_URL}/api/data/v9.2`

    const payload = {
      name: opportunityData.company || 'Untitled Account',
    }

    // Remove null values
    Object.keys(payload).forEach(key => {
      if (payload[key] === null || payload[key] === '') delete payload[key]
    })

    return {
      url: `${API}/accounts`,
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': 'Bearer <TOKEN>',
        'Prefer': 'return=representation'
      },
      body: payload
    }
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    
    try {
      await new Promise(resolve => setTimeout(resolve, 300))
      setShowPreview(true)
      
      // TODO: Uncomment when ready to execute
      // const token = await getDvToken(instance)
      // 1. Search for account
      // 2. Create/find contact if contact data provided
      // 3. Create opportunity with links
      
    } catch (err) {
      setError(err.message || 'Failed to save opportunity')
    } finally {
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
          {opportunityData.accountId 
            ? 'Review the opportunity details below. Click "Save to Dynamics" to create this opportunity in your CRM.'
            : 'Review the opportunity details below. Create the company/account first, then you can save the opportunity.'}
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

        {opportunityData.estimatedCloseDate && (
          <div className="review-field">
            <label className="review-field-label">Estimated close date</label>
            <div className="review-field-value">{opportunityData.estimatedCloseDate}</div>
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
        {!opportunityData.accountId && opportunityData.company && (
          <button 
            type="button" 
            className="btn btn-ghost" 
            onClick={() => setShowAccountPreview(true)}
          >
            <span className="icon icon-sm" aria-hidden="true">add_business</span>
            Create Company/Account
          </button>
        )}
        <button 
          type="button" 
          className="btn-primary" 
          onClick={handleSave}
          disabled={saving || !opportunityData.accountId}
        >
          <span className="icon icon-sm" aria-hidden="true">save</span>
          {saving ? 'Saving...' : 'Save to Dynamics'}
        </button>
      </div>

      <Modal 
        isOpen={showPreview} 
        onClose={() => setShowPreview(false)}
        title="🔍 API Call Preview"
        maxWidth="900px"
      >
        <ApiPreview apiCall={buildApiCall()} opportunityData={opportunityData} />
      </Modal>

      <Modal 
        isOpen={showAccountPreview} 
        onClose={() => setShowAccountPreview(false)}
        title="🏢 Create Account API Preview"
        maxWidth="900px"
      >
        <AccountApiPreview apiCall={buildAccountApiCall()} companyName={opportunityData?.company} />
      </Modal>
    </div>
  )
}

function AccountApiPreview({ apiCall, companyName }) {
  return (
    <div className="api-preview">
      <div className="api-preview-status ready">
        <strong>✅ READY TO CREATE ACCOUNT</strong>
        <div>
          ✓ Account name: "{companyName}"<br />
          ✓ Ready to create new account in Dynamics
        </div>
      </div>

      <div className="api-preview-section">
        <div className="api-preview-header">
          <span className="api-preview-method">{apiCall.method}</span>
          <span className="api-preview-url">{apiCall.url}</span>
        </div>
      </div>

      <div className="api-preview-section">
        <strong>Headers:</strong>
        <pre className="api-preview-code">{JSON.stringify(apiCall.headers, null, 2)}</pre>
      </div>

      <div className="api-preview-section">
        <strong>Body (Payload):</strong>
        <pre className="api-preview-code">{JSON.stringify(apiCall.body, null, 2)}</pre>
      </div>

      <div className="api-preview-divider">━━━━━━━━━━━━━━━━━━━━━━━━━━</div>

      <div className="api-preview-section">
        <strong>💡 Next Steps:</strong>
        <ul className="api-preview-steps">
          <li>Get authentication token</li>
          <li>Execute POST request to create account</li>
          <li>Get the new account GUID from response (accountid field)</li>
          <li>Use the account GUID to link the opportunity</li>
        </ul>
      </div>
    </div>
  )
}

function ApiPreview({ apiCall, opportunityData }) {
  return (
    <div className="api-preview">
      <div className={`api-preview-status ${apiCall.hasAccountGuid ? 'ready' : 'missing'}`}>
        <strong>
          {apiCall.hasAccountGuid ? '✅ READY TO SAVE' : '⚠️ MISSING DATA'}
        </strong>
        <div>
          {apiCall.hasAccountGuid ? (
            <>
              ✓ Account GUID available: {opportunityData.accountId}<br />
              ✓ All required data present<br />
              ✓ Ready to execute API call
            </>
          ) : opportunityData.company ? (
            <>
              ✗ Company name provided: "{opportunityData.company}"<br />
              → But account GUID is missing (user typed company name)<br />
              → Would need to search Dynamics for account by name
            </>
          ) : (
            '✗ No company/account provided'
          )}
        </div>
      </div>

      <div className="api-preview-section">
        <div className="api-preview-header">
          <span className="api-preview-method">{apiCall.method}</span>
          <span className="api-preview-url">{apiCall.url}</span>
        </div>
      </div>

      <div className="api-preview-section">
        <strong>Headers:</strong>
        <pre className="api-preview-code">{JSON.stringify(apiCall.headers, null, 2)}</pre>
      </div>

      <div className="api-preview-section">
        <strong>Body (Payload):</strong>
        <pre className="api-preview-code">{JSON.stringify(apiCall.body, null, 2)}</pre>
      </div>

      <div className="api-preview-divider">━━━━━━━━━━━━━━━━━━━━━━━━━━</div>

      <div className="api-preview-section">
        <strong>💡 Next Steps:</strong>
        <ul className="api-preview-steps">
          {apiCall.hasAccountGuid ? (
            <>
              <li>Get authentication token</li>
              <li>Execute POST request to create opportunity</li>
              <li>Handle response and show success message</li>
            </>
          ) : (
            <>
              <li>Search Dynamics for account by company name</li>
              <li>Add parentaccountid@odata.bind with account GUID</li>
              <li>Execute POST request to create opportunity</li>
            </>
          )}
        </ul>
      </div>
    </div>
  )
}
