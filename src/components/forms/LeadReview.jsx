import { useState, useEffect } from 'react'
import { useMsal } from '@azure/msal-react'
import { navigate } from '../../hooks/useHashRoute'
import Modal from '../Modal'
import { decodeReviewData } from '../../api/mailto'

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
  const [showPreview, setShowPreview] = useState(false)
  const [showAccountPreview, setShowAccountPreview] = useState(false)

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.hash.split('?')[1])
      const encoded = params.get('data')
      if (!encoded) {
        setError('Missing lead data in URL')
        return
      }
      const decoded = decodeReviewData(encoded)
      setLeadData(decoded)
    } catch (err) {
      setError('Invalid or corrupted lead data')
      console.error('Failed to decode lead data:', err)
    }
  }, [])

  function buildApiCall() {
    const BASE_URL = import.meta.env.VITE_DATAVERSE_URL?.replace(/\/$/, '') || 'https://yourorg.crm.dynamics.com'
    const API = `${BASE_URL}/api/data/v9.2`

    // Build the lead payload according to Dynamics schema
    const payload = {
      subject: leadData.topic || 'Untitled Lead',
      description: leadData.description || '',
      firstname: leadData.firstName || null,
      lastname: leadData.lastName || null,
      companyname: leadData.company || null,
      jobtitle: leadData.jobTitle || null,
      emailaddress1: leadData.email || null,
      telephone1: leadData.phone || null,
      address1_country: leadData.country || null,
      
      // Lead source and rating
      leadsourcecode: 8, // Other (can customize)
      leadqualitycode: 1, // Cold/Warm/Hot (1/2/3)
    }

    // Add account link if we have the GUID
    if (leadData.accountId) {
      payload['parentaccountid@odata.bind'] = `/accounts(${leadData.accountId})`
    }

    // Remove null values
    Object.keys(payload).forEach(key => {
      if (payload[key] === null || payload[key] === '') delete payload[key]
    })

    return {
      url: `${API}/leads`,
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': 'Bearer <TOKEN>',
        'Prefer': 'return=representation'
      },
      body: payload,
      hasAccountGuid: Boolean(leadData.accountId)
    }
  }

  function buildAccountApiCall() {
    const BASE_URL = import.meta.env.VITE_DATAVERSE_URL?.replace(/\/$/, '') || 'https://yourorg.crm.dynamics.com'
    const API = `${BASE_URL}/api/data/v9.2`

    const payload = {
      name: leadData.company || 'Untitled Account',
      address1_country: leadData.country || null,
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
      // const apiCall = buildApiCall()
      // const response = await fetch(apiCall.url, {
      //   method: apiCall.method,
      //   headers: { ...apiCall.headers, Authorization: `Bearer ${token}` },
      //   body: JSON.stringify(apiCall.body)
      // })
      // if (!response.ok) throw new Error('Failed to create lead')
      // navigate('')
      
    } catch (err) {
      setError(err.message || 'Failed to save lead')
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
          {leadData.accountId 
            ? 'Review the lead details below. Click "Save to Dynamics" to create this lead in your CRM.'
            : 'Review the lead details below. Create the company/account first, then you can save the lead.'}
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
        {!leadData.accountId && leadData.company && (
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
          disabled={saving || !leadData.accountId}
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
        <ApiPreview apiCall={buildApiCall()} leadData={leadData} />
      </Modal>

      <Modal 
        isOpen={showAccountPreview} 
        onClose={() => setShowAccountPreview(false)}
        title="🏢 Create Account API Preview"
        maxWidth="900px"
      >
        <AccountApiPreview apiCall={buildAccountApiCall()} companyName={leadData?.company} />
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
          <li>Get the new account GUID from response</li>
          <li>Use the account GUID to link the lead</li>
        </ul>
      </div>
    </div>
  )
}

function ApiPreview({ apiCall, leadData }) {
  return (
    <div className="api-preview">
      <div className={`api-preview-status ${apiCall.hasAccountGuid ? 'ready' : 'missing'}`}>
        <strong>
          {apiCall.hasAccountGuid ? '✅ READY TO SAVE' : '⚠️ MISSING DATA'}
        </strong>
        {apiCall.hasAccountGuid ? (
          <div>
            ✓ Account GUID available: {leadData.accountId}<br />
            ✓ All required data present<br />
            ✓ Ready to execute API call
          </div>
        ) : (
          <div>
            {leadData.company ? (
              <>
                ✗ Company name provided: "{leadData.company}"<br />
                → But account GUID is missing (user typed company name instead of selecting from list)<br />
                → Would need to search Dynamics for account by name
              </>
            ) : (
              '✗ No company/account provided'
            )}
          </div>
        )}
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
              <li>Execute POST request to create lead</li>
              <li>Handle response and show success message</li>
            </>
          ) : (
            <>
              <li>Search Dynamics for account by company name</li>
              <li>Add parentaccountid@odata.bind with account GUID</li>
              <li>Execute POST request to create lead</li>
            </>
          )}
        </ul>
      </div>
    </div>
  )
}
