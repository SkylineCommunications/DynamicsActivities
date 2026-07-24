import { useState } from 'react'
import { buildFormattedEmailBody, generateReviewLink } from '../api/mailto'

/**
 * Test page to preview email formatting without authentication.
 * Access via: http://localhost:5173/#/email-test
 */
export default function EmailPreviewTest() {
  const [formData, setFormData] = useState({
    topic: 'Enterprise Solution for Data Analytics',
    company: 'Acme Corporation',
    estimatedValue: '$150,000',
    estimatedCloseDate: '2026-09-15',
    description: 'Customer is looking for a comprehensive data monitoring solution for their global infrastructure. They have 500+ devices across 20 locations and need real-time monitoring capabilities.',
    submittedBy: 'John Doe <john.doe@example.com>'
  })

  const reviewLink = generateReviewLink('opportunity', formData)
  
  const rows = [
    ['Opportunity name', formData.topic],
    ['Company / Account', formData.company],
    ['Estimated value', formData.estimatedValue],
    ['Estimated close date', formData.estimatedCloseDate],
    ['Description', formData.description],
    ['Submitted by', formData.submittedBy],
  ]

  const emailBody = buildFormattedEmailBody(
    '💡 NEW OPPORTUNITY SUBMISSION',
    rows,
    reviewLink,
    '✅ Save this opportunity to Dynamics'
  )

  function copyToClipboard() {
    navigator.clipboard.writeText(emailBody)
    alert('Email body copied to clipboard!')
  }

  return (
    <div style={{ maxWidth: '900px', margin: '20px auto', padding: '20px' }}>
      <div style={{ marginBottom: '30px' }}>
        <h1>Email Preview Test</h1>
        <p style={{ color: '#666' }}>
          This page shows how the email body will look when sent via mailto:.
          Most email clients will automatically make the URL clickable.
        </p>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <button 
          onClick={copyToClipboard}
          style={{
            padding: '10px 20px',
            background: '#0078d4',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            marginRight: '10px'
          }}
        >
          📋 Copy to Clipboard
        </button>
        <button 
          onClick={() => {
            const mailto = `mailto:loes.vervaele@skyline.be?subject=${encodeURIComponent('[New Opportunity] Enterprise Solution for Data Analytics (Acme Corporation)')}&body=${encodeURIComponent(emailBody)}`
            const anchor = document.createElement('a')
            anchor.href = mailto
            anchor.click()
          }}
          style={{
            padding: '10px 20px',
            background: '#107c10',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          ✉️ Open in Email Client
        </button>
      </div>

      <div style={{ 
        background: '#f5f5f5', 
        border: '1px solid #ddd',
        borderRadius: '4px',
        padding: '20px',
        fontFamily: 'Consolas, Monaco, monospace',
        fontSize: '13px',
        lineHeight: '1.6',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all'
      }}>
        {emailBody}
      </div>

      <div style={{ marginTop: '30px', padding: '20px', background: '#e8f4f8', borderRadius: '4px' }}>
        <h3>Generated Review Link:</h3>
        <div style={{ 
          background: 'white', 
          padding: '10px', 
          borderRadius: '4px',
          wordBreak: 'break-all',
          fontFamily: 'Consolas, Monaco, monospace',
          fontSize: '12px'
        }}>
          {reviewLink}
        </div>
      </div>
    </div>
  )
}
