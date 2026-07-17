import AutocompletePicker from './AutocompletePicker'
import { EMAIL_PARTICIPANT_ROLES, groupEmailParticipants } from '../utils/emailParticipants'

export default function EmailParticipantFields({
  participants = [],
  searchFn,
  onAdd,
  onRemove,
  renderParticipant,
  currentUserLabel = 'You (current user)',
  preferredIds = [],
}) {
  const groups = groupEmailParticipants(participants)

  return (
    <div className="email-participant-sections">
      {EMAIL_PARTICIPANT_ROLES.map((role) => (
        <div key={role} className="email-recipient-row">
          <div className="field-label email-recipient-label">{role}</div>
          <div className="chip-list email-recipient-content">
            <AutocompletePicker
              searchFn={searchFn}
              getKey={(contact) => contact.contactid}
              getLabel={(contact) => contact.fullname}
              getSublabel={(contact) => contact.emailaddress1}
              value={null}
              onChange={(contact) => onAdd(contact, role)}
              placeholder={role === 'From' ? 'Change from…' : `Add ${role.toLowerCase()} recipient…`}
              clearOnPick
              autoSelectSingle
              minChars={0}
              loadOnFocus
              allowEmptySearch
              preferredIds={preferredIds}
            />
            <div className="chip-list">
              {role === 'From' && !groups[role].length && (
                <span className="chip chip-linked">{currentUserLabel}</span>
              )}
              {groups[role].map((participant) => (
                <span key={`${role}:${participant.email.toLowerCase()}`}>
                  {renderParticipant({
                    participant,
                    onRemove: () => onRemove(participant),
                  })}
                </span>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
