import { useEffect, useMemo, useRef, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { getConversationMessages, getRecentInboxMessages } from '../api/graph'
import {
  checkSyncedMessageIds,
  createContact,
  createInboxEmailActivity,
  findContactByEmail,
  getThreadSuggestion,
  resolveAccountForRegarding,
  relinkExistingEmails,
  suggestAccountByEmailDomain,
  searchAccounts,
  searchLeads,
  searchOpportunities,
} from '../api/dataverse'
import AutocompletePicker from './AutocompletePicker'
import { buildBrowseAccountFromRegarding } from '../services/postCreateBrowseAccount'

const REGARDING_TYPES = [
  { id: 'account', label: 'Account' },
  { id: 'opportunity', label: 'Opportunity' },
  { id: 'lead', label: 'Lead' },
]
const INTERNAL_DOMAINS = ['@skyline.be', '@dataminer.services']

function fmtDate(d) {
  if (!d) return ''
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function fmtDateShort(d) {
  if (!d) return ''
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function splitRecipients(message) {
  const participants = []
  if (message.from?.email) {
    participants.push({ role: 'From', name: message.from.name || message.from.email, email: message.from.email })
  }
  for (const recipient of message.toRecipients ?? []) {
    if (!recipient.email) continue
    participants.push({ role: 'To', name: recipient.name || recipient.email, email: recipient.email })
  }
  for (const recipient of message.ccRecipients ?? []) {
    if (!recipient.email) continue
    participants.push({ role: 'CC', name: recipient.name || recipient.email, email: recipient.email })
  }
  const seen = new Set()
  return participants.filter((p) => {
    const key = p.email.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function normaliseThreadMessages(messages) {
  return [...messages].sort((a, b) => (b.receivedDateTime?.getTime?.() || 0) - (a.receivedDateTime?.getTime?.() || 0))
}

function getImportRegardingPayload(regardingType, regardingItem) {
  if (!regardingItem) return { regardingId: null, regardingAccountId: null }
  const isEscalationLink = ['escalation', 'slc_escalation', 'slc_escalations'].includes(regardingType)
  return {
    regardingId: isEscalationLink
      ? regardingItem.slc_escalationid || regardingItem.activityid || null
      : regardingItem[`${regardingType}id`] || null,
    regardingAccountId: isEscalationLink
      ? regardingItem._regardingobjectid_value || regardingItem.accountid || null
      : null,
  }
}

function groupMessagesIntoThreads(messages, syncedSet) {
  const map = new Map()
  for (const message of messages) {
    const key = message.conversationId || message.internetMessageId || message.id
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(message)
  }

  return [...map.entries()]
    .map(([key, threadMessages]) => {
      const sorted = normaliseThreadMessages(threadMessages)
      const syncedCount = sorted.filter((m) => m.internetMessageId && syncedSet.has(m.internetMessageId)).length
      return {
        key,
        conversationId: sorted[0]?.conversationId || '',
        messages: sorted,
        latest: sorted[0],
        totalCount: sorted.length,
        syncedCount,
      }
    })
    .sort((a, b) => (b.latest?.receivedDateTime?.getTime?.() || 0) - (a.latest?.receivedDateTime?.getTime?.() || 0))
}

function threadStatus(thread) {
  if (!thread.totalCount) return 'unknown'
  if (!thread.syncedCount) return 'none'
  if (thread.syncedCount === thread.totalCount) return 'complete'
  return 'partial'
}

function threadSearchHaystack(thread) {
  return thread.messages
    .flatMap((m) => [
      m.subject,
      m.from?.name,
      m.from?.email,
      m.bodyPreview,
      ...(m.toRecipients ?? []).map((r) => `${r.name} ${r.email}`),
      ...(m.ccRecipients ?? []).map((r) => `${r.name} ${r.email}`),
    ])
    .join(' ')
    .toLowerCase()
}

function isInternalEmail(email) {
  const normalized = String(email || '').trim().toLowerCase()
  return INTERNAL_DOMAINS.some((domain) => normalized.endsWith(domain))
}

function threadHasExternalContacts(thread) {
  return thread.messages.some((m) => {
    const addresses = [
      m.from?.email,
      ...(m.toRecipients ?? []).map((r) => r.email),
      ...(m.ccRecipients ?? []).map((r) => r.email),
    ]
    return addresses
      .map((email) => String(email || '').trim().toLowerCase())
      .some((email) => email && !isInternalEmail(email))
  })
}

function mapSuggestionToItem(suggestion) {
  if (!suggestion) return null
  if (suggestion.regardingType === 'account') return { accountid: suggestion.regardingId, name: suggestion.label }
  if (suggestion.regardingType === 'opportunity') return { opportunityid: suggestion.regardingId, name: suggestion.label }
  if (suggestion.regardingType === 'lead') return { leadid: suggestion.regardingId, fullname: suggestion.label }
  return null
}

function splitName(displayName, email) {
  const raw = String(displayName || '').trim()
  const emailNorm = String(email || '').trim().toLowerCase()
  if (!raw || raw.toLowerCase() === emailNorm) return { firstname: '', lastname: '' }
  const parts = raw.split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return { firstname: parts[0] || '', lastname: '' }
  return { firstname: parts[0], lastname: parts.slice(1).join(' ') }
}

function hasPlausibleDomain(email) {
  const normalized = String(email || '').trim().toLowerCase()
  const at = normalized.lastIndexOf('@')
  if (at <= 0 || at === normalized.length - 1) return false
  const domain = normalized.slice(at + 1)
  return domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.')
}

function ContactCreatePrompt({
  draft,
  domainSuggestedAccount,
  onClose,
  onChange,
  onPickDomainSuggestion,
  onConfirm,
  creating,
  searchAccountsFn,
}) {
  if (!draft) return null
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && !creating && onClose()}>
      <div className="modal contact-create-modal">
        <div className="modal-header">
          <h3 className="modal-title">Create contact</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close" disabled={creating}>×</button>
        </div>
        <div className="modal-body">
          <div className="contact-create-grid">
            <label className="field-label" htmlFor="contact-firstname">First name</label>
            <input
              id="contact-firstname"
              className="input"
              value={draft.firstname}
              onChange={(e) => onChange('firstname', e.target.value)}
              placeholder="Contact first name"
              autoFocus
            />

            <label className="field-label" htmlFor="contact-lastname">Last name</label>
            <input
              id="contact-lastname"
              className="input"
              value={draft.lastname}
              onChange={(e) => onChange('lastname', e.target.value)}
              placeholder="Contact last name"
            />

            <label className="field-label" htmlFor="contact-email">Email</label>
            <input
              id="contact-email"
              className="input"
              value={draft.email}
              onChange={(e) => onChange('email', e.target.value)}
              placeholder="name@company.com"
            />

            <label className="field-label" htmlFor="contact-jobtitle">Job title</label>
            <input
              id="contact-jobtitle"
              className="input"
              value={draft.jobtitle}
              onChange={(e) => onChange('jobtitle', e.target.value)}
              placeholder="Job title"
            />

            <label className="field-label" htmlFor="contact-phone">Phone</label>
            <input
              id="contact-phone"
              className="input"
              value={draft.phone}
              onChange={(e) => onChange('phone', e.target.value)}
              placeholder="Phone number"
            />

            <label className="field-label">Account / Company link</label>
            <AutocompletePicker
              searchFn={searchAccountsFn}
              getKey={(a) => a.accountid}
              getLabel={(a) => a.name}
              value={draft.account}
              onChange={(item) => onChange('account', item)}
              placeholder="Search account…"
              autoSelectSingle
            />
            {!draft.account && domainSuggestedAccount && (
              <button
                type="button"
                className="suggestion-chip"
                onClick={onPickDomainSuggestion}
                disabled={creating}
              >
                💡 Suggested from @{domainSuggestedAccount.domain}: {domainSuggestedAccount.name}
              </button>
            )}
          </div>

          <div className="inbox-modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={creating}>Cancel</button>
            <button type="button" className="btn-primary" onClick={onConfirm} disabled={creating}>
              {creating ? 'Creating…' : 'Create contact'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ThreadDetailView({ thread, onAddToDynamics }) {
  const [expandedMessageIds, setExpandedMessageIds] = useState(() => new Set())
  useEffect(() => {
    setExpandedMessageIds(new Set())
  }, [thread.key])

  const latestMessage = thread.latest
  const status = threadStatus(thread)
  const toLine = (latestMessage.toRecipients ?? []).map((r) => r.name || r.email).join(', ')
  const ccLine = (latestMessage.ccRecipients ?? []).map((r) => r.name || r.email).join(', ')
  const toggleMessage = (messageId) => {
    setExpandedMessageIds((prev) => {
      const next = new Set(prev)
      if (next.has(messageId)) next.delete(messageId)
      else next.add(messageId)
      return next
    })
  }

  return (
    <div className="mail-detail">
      <div className="mail-detail-subject">{latestMessage.subject}</div>

      <div className="mail-thread-meta">
        <span className="mail-thread-count">{thread.totalCount} message{thread.totalCount === 1 ? '' : 's'}</span>
        {thread.totalCount > 1 && <span className="mail-thread-count">Latest shown</span>}
        {status === 'complete' && <span className="inbox-thread-badge inbox-thread-complete">Fully imported</span>}
        {status === 'partial' && <span className="inbox-thread-badge inbox-thread-partial">Partial import ({thread.syncedCount}/{thread.totalCount})</span>}
      </div>

      <div className="mail-detail-top-actions">
        <button type="button" className="btn-primary" onClick={onAddToDynamics}>
          Import thread to Dynamics
        </button>
        {latestMessage.webLink && (
          <a href={latestMessage.webLink} target="_blank" rel="noopener noreferrer" className="btn-ghost">
            Open latest in Outlook →
          </a>
        )}
      </div>

      <div className="mail-detail-meta">
        <div className="mail-detail-meta-row">
          <span className="mail-detail-meta-label">From</span>
          <span>{latestMessage.from?.name ? `${latestMessage.from.name} <${latestMessage.from.email}>` : latestMessage.from?.email}</span>
        </div>
        {toLine && (
          <div className="mail-detail-meta-row">
            <span className="mail-detail-meta-label">To</span>
            <span>{toLine}</span>
          </div>
        )}
        {ccLine && (
          <div className="mail-detail-meta-row">
            <span className="mail-detail-meta-label">CC</span>
            <span>{ccLine}</span>
          </div>
        )}
        <div className="mail-detail-meta-row">
          <span className="mail-detail-meta-label">Date</span>
          <span>{fmtDate(latestMessage.receivedDateTime)}</span>
        </div>
      </div>

      <div className="mail-detail-body">{latestMessage.bodyPreview || <em>No preview available</em>}</div>

      {thread.totalCount > 1 && (
        <div className="mail-thread-list">
          {thread.messages.map((message) => {
            const expanded = expandedMessageIds.has(message.id)
            const itemToLine = (message.toRecipients ?? []).map((r) => r.name || r.email).join(', ')
            const itemCcLine = (message.ccRecipients ?? []).map((r) => r.name || r.email).join(', ')
            return (
              <div key={message.id} className="mail-thread-entry">
                <button
                  type="button"
                  className={`mail-thread-item-btn ${expanded ? 'active' : ''}`}
                  onClick={() => toggleMessage(message.id)}
                  aria-expanded={expanded}
                >
                  <div className="mail-thread-item">
                    <div className="mail-thread-item-title">{message.subject}</div>
                    <div className="mail-thread-item-meta">
                      <span>{message.from?.name || message.from?.email || 'Unknown'}</span>
                      <span>{fmtDateShort(message.receivedDateTime)}</span>
                    </div>
                  </div>
                </button>
                {expanded && (
                  <div className="mail-thread-item-expanded">
                    <div className="mail-thread-item-expanded-meta">
                      <span><strong>From:</strong> {message.from?.name ? `${message.from.name} <${message.from.email}>` : (message.from?.email || 'Unknown')}</span>
                      {itemToLine && <span><strong>To:</strong> {itemToLine}</span>}
                      {itemCcLine && <span><strong>CC:</strong> {itemCcLine}</span>}
                      <span><strong>Date:</strong> {fmtDate(message.receivedDateTime)}</span>
                    </div>
                    <div className="mail-thread-item-expanded-body">{message.bodyPreview || <em>No preview available</em>}</div>
                    {message.webLink && (
                      <a href={message.webLink} target="_blank" rel="noopener noreferrer" className="mail-thread-item-expanded-link">
                        Open in Outlook →
                      </a>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function MailAddModal({ thread, mailbox, onClose, onImported, selectedAccount = null }) {
  const { instance } = useMsal()
  const [regardingType, setRegardingType] = useState('account')
  const [regardingItem, setRegardingItem] = useState(() => (
    selectedAccount?.accountid ? { accountid: selectedAccount.accountid, name: selectedAccount.name } : null
  ))
  const [contactsByEmail, setContactsByEmail] = useState({})
  const [loadingContacts, setLoadingContacts] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadingThread, setLoadingThread] = useState(false)
  const [error, setError] = useState(null)
  const [contactDraft, setContactDraft] = useState(null)
  const [domainSuggestedAccount, setDomainSuggestedAccount] = useState(null)
  const [creatingContact, setCreatingContact] = useState(false)
  const [threadMessages, setThreadMessages] = useState(thread.messages)
  const [existingByMessageId, setExistingByMessageId] = useState(new Map())
  const [originalSuggestion, setOriginalSuggestion] = useState(null)

  useEffect(() => {
    let cancelled = false
    if (!thread.conversationId) {
      setThreadMessages(thread.messages)
      return
    }
    setLoadingThread(true)
    getConversationMessages(instance, { conversationId: thread.conversationId, mailbox: mailbox || undefined })
      .then((messages) => {
        if (!cancelled && messages.length) setThreadMessages(normaliseThreadMessages(messages))
      })
      .catch((e) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoadingThread(false) })
    return () => { cancelled = true }
  }, [instance, thread.conversationId, thread.messages, mailbox])

  const threadIds = useMemo(
    () => threadMessages.map((m) => m.internetMessageId).filter(Boolean),
    [threadMessages],
  )

  useEffect(() => {
    let cancelled = false
    if (!threadIds.length) {
      setExistingByMessageId(new Map())
      setOriginalSuggestion(null)
      return
    }
    getThreadSuggestion(instance, threadIds)
      .then(({ existingByMessageId: existing, suggestion }) => {
        if (cancelled) return
        setExistingByMessageId(existing)
        setOriginalSuggestion(suggestion)
      })
      .catch((e) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [instance, threadIds])

  const participants = useMemo(() => {
    const merged = []
    for (const message of threadMessages) merged.push(...splitRecipients(message))
    const seen = new Set()
    return merged.filter((p) => {
      const key = p.email.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [threadMessages])

  const importedCount = useMemo(
    () => threadIds.filter((id) => existingByMessageId.has(id)).length,
    [threadIds, existingByMessageId],
  )
  const missingCount = Math.max(threadIds.length - importedCount, 0)

  useEffect(() => {
    let cancelled = false
    setLoadingContacts(true)
    setContactsByEmail({})
    Promise.all(
      participants.map(async (p) => {
        const contact = await findContactByEmail(instance, p.email, selectedAccount?.accountid || null)
        return [p.email.toLowerCase(), contact]
      }),
    )
      .then((entries) => {
        if (cancelled) return
        setContactsByEmail(Object.fromEntries(entries.filter(([, c]) => c)))
      })
      .catch((e) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoadingContacts(false) })
    return () => { cancelled = true }
  }, [instance, participants, selectedAccount?.accountid])

  const suggestedAccount = useMemo(() => {
    if (regardingType !== 'account') return null
    const externalCounts = new Map()
    const internalCounts = new Map()
    for (const [email, contact] of Object.entries(contactsByEmail)) {
      const accountId = contact?._parentcustomerid_value
      const accountType = contact?.['_parentcustomerid_value@Microsoft.Dynamics.CRM.lookuplogicalname']
      if (!accountId || accountType !== 'account') continue
      const accountName =
        contact?.['_parentcustomerid_value@OData.Community.Display.V1.FormattedValue'] || 'Suggested account'
      const isInternal = isInternalEmail(email)
      const bucket = isInternal ? internalCounts : externalCounts
      const current = bucket.get(accountId) || { accountid: accountId, name: accountName, count: 0 }
      current.count += 1
      bucket.set(accountId, current)
    }
    const preferredBucket = externalCounts.size ? externalCounts : internalCounts
    const best = [...preferredBucket.values()].sort((a, b) => b.count - a.count)[0]
    return best ? { accountid: best.accountid, name: best.name } : null
  }, [contactsByEmail, regardingType])

  const regardingConfig = {
    account: {
      searchFn: (q) => searchAccounts(instance, q),
      getKey: (a) => a.accountid,
      getLabel: (a) => a.name,
      placeholder: 'Search account…',
      sublabel: null,
    },
    opportunity: {
      searchFn: (q) => searchOpportunities(instance, q),
      getKey: (o) => o.opportunityid,
      getLabel: (o) => o.name,
      placeholder: 'Search opportunity…',
      sublabel: null,
    },
    lead: {
      searchFn: (q) => searchLeads(instance, q),
      getKey: (l) => l.leadid,
      getLabel: (l) => l.fullname || '(No name)',
      placeholder: 'Search lead…',
      sublabel: (l) => l.companyname || '',
    },
  }[regardingType]

  function pickOriginalSuggestion() {
    if (!originalSuggestion) return
    setRegardingType(originalSuggestion.regardingType)
    setRegardingItem(mapSuggestionToItem(originalSuggestion))
  }

  function handleOpenCreateContact(participant) {
    const { firstname, lastname } = splitName(participant.name, participant.email)
    const defaultAccount = regardingType === 'account' ? regardingItem : null
    setContactDraft({
      participant,
      firstname,
      lastname,
      email: participant.email || '',
      jobtitle: '',
      phone: '',
      account: defaultAccount,
    })
  }

  function handleCloseCreateContact() {
    if (creatingContact) return
    setContactDraft(null)
  }

  function updateContactDraftField(field, value) {
    setContactDraft((prev) => (prev ? { ...prev, [field]: value } : prev))
  }

  function pickDomainSuggestion() {
    if (!domainSuggestedAccount) return
    updateContactDraftField('account', {
      accountid: domainSuggestedAccount.accountid,
      name: domainSuggestedAccount.name,
    })
  }

  useEffect(() => {
    let cancelled = false
    const email = contactDraft?.email || ''
    const hasManualAccount = !!contactDraft?.account
    if (!email || !hasPlausibleDomain(email) || hasManualAccount) {
      setDomainSuggestedAccount(null)
      return () => { cancelled = true }
    }
    const timer = setTimeout(() => {
      suggestAccountByEmailDomain(instance, email)
        .then((suggestion) => {
          if (!cancelled) setDomainSuggestedAccount(suggestion)
        })
        .catch(() => {
          if (!cancelled) setDomainSuggestedAccount(null)
        })
    }, 350)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [instance, contactDraft?.email, contactDraft?.account?.accountid])

  async function handleCreateContact() {
    if (!contactDraft) return
    setError(null)
    setCreatingContact(true)
    try {
      const firstname = contactDraft.firstname.trim()
      const lastname = contactDraft.lastname.trim()
      const emailaddress1 = contactDraft.email.trim()
      const jobtitle = contactDraft.jobtitle.trim()
      const telephone1 = contactDraft.phone.trim()
      const contact = await createContact(instance, {
        firstname: firstname || null,
        lastname: lastname || null,
        emailaddress1: emailaddress1 || null,
        jobtitle: jobtitle || null,
        telephone1: telephone1 || null,
        accountId: contactDraft.account?.accountid || null,
      })
      const editedEmailKey = (emailaddress1 || '').toLowerCase()
      const participantEmailKey = String(contactDraft.participant?.email || '').trim().toLowerCase()
      setContactsByEmail((prev) => {
        const next = { ...prev }
        if (participantEmailKey) next[participantEmailKey] = contact
        if (editedEmailKey) next[editedEmailKey] = contact
        return next
      })
      setContactDraft(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setCreatingContact(false)
    }
  }

  async function handleImport({ missingOnly }) {
    if (!regardingItem) return
    const { regardingId, regardingAccountId } = getImportRegardingPayload(regardingType, regardingItem)
    setSaving(true)
    setError(null)
    try {
      const targetMessages = missingOnly
        ? threadMessages.filter((m) => !existingByMessageId.has(m.internetMessageId))
        : threadMessages
      const relinkActivityIds = []
      const importedIds = []

      for (const message of targetMessages) {
        const existing = existingByMessageId.get(message.internetMessageId)
        if (existing?.activityid) {
          relinkActivityIds.push(existing.activityid)
          continue
        }

        await createInboxEmailActivity(instance, {
          message,
          regardingType,
          regardingId,
          regardingAccountId,
          contactsByEmail,
        })
        if (message.internetMessageId) importedIds.push(message.internetMessageId)
      }

      if (relinkActivityIds.length && !missingOnly) {
        await relinkExistingEmails(instance, relinkActivityIds, {
          regardingType,
          regardingId,
          regardingAccountId,
        })
      }

      const resolvedAccount = regardingType === 'account'
        ? null
        : await resolveAccountForRegarding(instance, { regardingType, regardingId })
      const browseAccount = buildBrowseAccountFromRegarding({
        regardingType,
        regardingItem,
        resolvedAccount,
      })

      onImported?.({
        importedIds,
        relinkedIds: relinkActivityIds,
        allThreadIds: threadIds,
        browseAccount,
      })
      onClose()
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay inbox-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal inbox-modal">
        <div className="modal-header">
          <h3 className="modal-title">Import thread to Dynamics</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="modal-body inbox-modal-body">
          <div className="inbox-message-summary">
            <div className="inbox-message-subject">{thread.latest.subject}</div>
            <div className="inbox-message-meta">
              <span>{threadMessages.length} messages in thread</span>
              <span>{fmtDate(thread.latest.receivedDateTime)}</span>
            </div>
            {loadingThread && <div className="hint-text">Loading full thread…</div>}
            {!!threadIds.length && (
              <div className="mail-thread-meta">
                {missingCount === 0 ? (
                  <span className="inbox-thread-badge inbox-thread-complete">Fully imported ({importedCount}/{threadIds.length})</span>
                ) : importedCount > 0 ? (
                  <span className="inbox-thread-badge inbox-thread-partial">Partial import ({importedCount}/{threadIds.length})</span>
                ) : (
                  <span className="inbox-thread-badge">Not imported yet</span>
                )}
              </div>
            )}
          </div>

          <div className="inbox-modal-actions inbox-modal-actions-top">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            {missingCount > 0 && (
              <button type="button" className="btn-ghost" onClick={() => handleImport({ missingOnly: true })} disabled={!regardingItem || saving}>
                {saving ? 'Importing…' : `Import missing (${missingCount})`}
              </button>
            )}
            <button type="button" className="btn-primary" onClick={() => handleImport({ missingOnly: false })} disabled={!regardingItem || saving}>
              {saving ? 'Importing…' : 'Import full thread'}
            </button>
          </div>

          <div className="inbox-section">
            <div className="inbox-section-label">Link thread to</div>
            <div className="filter-type-btns inbox-regarding-types">
              {REGARDING_TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`filter-type-btn ${regardingType === t.id ? 'active' : ''}`}
                  onClick={() => setRegardingType(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <AutocompletePicker
              searchFn={regardingConfig.searchFn}
              getKey={regardingConfig.getKey}
              getLabel={regardingConfig.getLabel}
              getSublabel={regardingConfig.sublabel}
              value={regardingItem}
              onChange={setRegardingItem}
              placeholder={regardingConfig.placeholder}
              autoSelectSingle
            />

            {!regardingItem && originalSuggestion && (
              <button type="button" className="suggestion-chip" onClick={pickOriginalSuggestion}>
                💡 Original link: {originalSuggestion.label}
              </button>
            )}

            {regardingType === 'account' && !regardingItem && suggestedAccount && (
              <button type="button" className="suggestion-chip" onClick={() => setRegardingItem(suggestedAccount)}>
                💡 Suggested: {suggestedAccount.name}
              </button>
            )}
          </div>

          <div className="inbox-section">
            <div className="inbox-section-label">Contacts</div>
            <div className="inbox-participants">
              {participants.map((participant) => {
                const contact = contactsByEmail[participant.email.toLowerCase()]
                return (
                  <div key={participant.email} className="inbox-participant">
                    <div>
                      <div className="inbox-participant-role">{participant.role}</div>
                      <div className="inbox-participant-name">{participant.name}</div>
                      <div className="inbox-participant-email">{participant.email}</div>
                    </div>
                    {contact ? (
                      <span className="chip-sm chip-linked">✓ Linked contact</span>
                    ) : (
                      <button type="button" className="btn-ghost btn-sm" onClick={() => handleOpenCreateContact(participant)}>
                        Create contact
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
            {loadingContacts && <div className="hint-text">Checking existing contacts…</div>}
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          <div className="inbox-modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
      <ContactCreatePrompt
        draft={contactDraft}
        domainSuggestedAccount={domainSuggestedAccount}
        onClose={handleCloseCreateContact}
        onChange={updateContactDraftField}
        onPickDomainSuggestion={pickDomainSuggestion}
        onConfirm={handleCreateContact}
        creating={creatingContact}
        searchAccountsFn={(q) => searchAccounts(instance, q)}
      />
    </div>
  )
}

export default function InboxTab({ compact = false, onImported, selectedAccount = null }) {
  const { instance } = useMsal()
  const [messages, setMessages] = useState([])
  const [nextLink, setNextLink] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
  const [hideSynced, setHideSynced] = useState(false)
  const [externalOnly, setExternalOnly] = useState(false)
  const [syncedSet, setSyncedSet] = useState(new Set())
  const [mailbox, setMailbox] = useState('')
  const [mailboxDraft, setMailboxDraft] = useState('')
  const [selectedThreadKey, setSelectedThreadKey] = useState(null)
  const [addingThread, setAddingThread] = useState(null)
  const sentinelRef = useRef(null)

  function mergeChecked(ids) {
    if (!ids.size) return
    setSyncedSet((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => next.add(id))
      return next
    })
  }

  useEffect(() => {
    setLoading(true)
    setError(null)
    setMessages([])
    setNextLink(null)
    setSelectedThreadKey(null)
    getRecentInboxMessages(instance, { mailbox: mailbox || undefined })
      .then(({ messages: items, nextLink: nl }) => {
        setMessages(items)
        setNextLink(nl)
        const ids = items.map((m) => m.internetMessageId).filter(Boolean)
        checkSyncedMessageIds(instance, ids).then(mergeChecked).catch(() => {})
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [instance, mailbox])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && nextLink && !loadingMore && !loading) {
          setLoadingMore(true)
          getRecentInboxMessages(instance, { nextLink, mailbox: mailbox || undefined })
            .then(({ messages: more, nextLink: nl }) => {
              setMessages((prev) => [...prev, ...more])
              setNextLink(nl)
              const ids = more.map((m) => m.internetMessageId).filter(Boolean)
              checkSyncedMessageIds(instance, ids).then(mergeChecked).catch(() => {})
            })
            .catch((e) => setError(e.message))
            .finally(() => setLoadingMore(false))
        }
      },
      { threshold: 0 },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [instance, nextLink, loadingMore, loading, mailbox])

  const allThreads = useMemo(() => groupMessagesIntoThreads(messages, syncedSet), [messages, syncedSet])

  const filteredThreads = useMemo(() => {
    const q = query.trim().toLowerCase()
    let base = allThreads
    if (hideSynced) base = base.filter((thread) => threadStatus(thread) !== 'complete')
    if (externalOnly) base = base.filter(threadHasExternalContacts)
    if (!q) return base
    return base.filter((thread) => threadSearchHaystack(thread).includes(q))
  }, [allThreads, query, hideSynced, externalOnly])

  const selectedThread = useMemo(
    () => filteredThreads.find((thread) => thread.key === selectedThreadKey) || allThreads.find((thread) => thread.key === selectedThreadKey) || null,
    [filteredThreads, allThreads, selectedThreadKey],
  )

  useEffect(() => {
    if (!selectedThreadKey && filteredThreads.length) {
      setSelectedThreadKey(filteredThreads[0].key)
      return
    }
    if (selectedThreadKey && !allThreads.some((thread) => thread.key === selectedThreadKey)) {
      setSelectedThreadKey(filteredThreads[0]?.key || null)
    }
  }, [filteredThreads, allThreads, selectedThreadKey])

  function commitMailbox() {
    setMailbox(mailboxDraft.trim())
  }

  return (
    <div className={compact ? 'inbox-container inbox-container-embedded' : 'inbox-container'}>
      <div className="filter-panel inbox-toolbar">
        <div className="filter-row">
          <div className="filter-field">
            <label className="filter-label">Mailbox</label>
            <div className="mailbox-field">
              <input
                className="input"
                value={mailboxDraft}
                onChange={(e) => setMailboxDraft(e.target.value)}
                onBlur={commitMailbox}
                onKeyDown={(e) => e.key === 'Enter' && commitMailbox()}
                placeholder="My mailbox"
              />
              {mailbox && (
                <button
                  type="button"
                  className="mailbox-clear"
                  onClick={() => { setMailboxDraft(''); setMailbox('') }}
                  aria-label="Clear mailbox"
                >×</button>
              )}
            </div>
          </div>
          <div className="filter-field inbox-search-field">
            <label className="filter-label">Search</label>
            <input
              className="input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by subject, sender or recipient…"
            />
          </div>
          <div className="filter-field inbox-toggle-field">
            <div className="inbox-toggle-buttons">
              <button
                type="button"
                className={`filter-type-btn ${hideSynced ? 'active' : ''}`}
                onClick={() => setHideSynced((v) => !v)}
              >
                {hideSynced ? '✓ Hide synced threads' : 'Hide synced threads'}
              </button>
              <button
                type="button"
                className={`filter-type-btn ${externalOnly ? 'active' : ''}`}
                onClick={() => setExternalOnly((v) => !v)}
              >
                {externalOnly ? '✓ External contacts' : 'External contacts'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && <div className="alert alert-error inbox-alert">{error}</div>}

      <div className="inbox-body">
        <div className="mail-list-pane">
          {loading && <div className="loading-text inbox-loading-text">Loading{mailbox ? ` ${mailbox}` : ' inbox'}…</div>}

          {!loading && filteredThreads.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">📨</div>
              <div className="empty-title">No mail found</div>
              <div className="empty-sub">Try a different search or check that Mail.Read is consented.</div>
            </div>
          )}

          {filteredThreads.map((thread) => {
            const status = threadStatus(thread)
            const active = selectedThreadKey === thread.key
            return (
              <button
                key={thread.key}
                type="button"
                className={`inbox-card inbox-thread-card ${active ? 'active' : ''} ${status === 'complete' ? 'inbox-card-synced' : ''}`}
                onClick={() => setSelectedThreadKey(thread.key)}
              >
                <div className="inbox-card-head">
                  <div className="inbox-card-sender">
                    {!thread.latest.isRead && <span className="inbox-unread-dot" aria-hidden="true" />}
                    <span className={thread.latest.isRead ? '' : 'inbox-sender-unread'}>
                      {thread.latest.from?.name || thread.latest.from?.email || 'Unknown'}
                    </span>
                  </div>
                  <div className="inbox-card-head-right">
                    {status === 'complete' && <span className="inbox-synced-badge">✓</span>}
                    {status === 'partial' && <span className="inbox-thread-badge inbox-thread-partial-sm">Partial</span>}
                    <span className="inbox-card-date">{fmtDateShort(thread.latest.receivedDateTime)}</span>
                  </div>
                </div>
                <div className="inbox-card-subject">{thread.latest.subject}</div>
                <div className="inbox-thread-subline">
                  <span>{thread.totalCount} message{thread.totalCount === 1 ? '' : 's'}</span>
                  {status === 'partial' && <span>{thread.syncedCount} imported</span>}
                </div>
              </button>
            )
          })}

          <div ref={sentinelRef} className="inbox-sentinel" />
          {loadingMore && <div className="inbox-load-more">Loading more…</div>}
        </div>

        <div className="mail-detail-pane">
          {selectedThread ? (
            <ThreadDetailView
              thread={selectedThread}
              onAddToDynamics={() => setAddingThread(selectedThread)}
            />
          ) : (
            <div className="empty-state inbox-empty-state">
              <div className="empty-icon">📬</div>
              <div className="empty-title">No thread selected</div>
              <div className="empty-sub">Select a thread from the list to preview it.</div>
            </div>
          )}
        </div>
      </div>

      {addingThread && (
        <MailAddModal
          thread={addingThread}
          mailbox={mailbox}
          selectedAccount={selectedAccount}
          onClose={() => setAddingThread(null)}
          onImported={({ importedIds, allThreadIds, browseAccount }) => {
            const knownIds = [...importedIds, ...allThreadIds].filter(Boolean)
            if (knownIds.length) {
              setSyncedSet((prev) => new Set([...prev, ...knownIds]))
            }
            onImported?.({ importedIds, allThreadIds, browseAccount })
            setAddingThread(null)
          }}
        />
      )}
    </div>
  )
}
