export const EMAIL_PARTICIPANT_ROLES = ['From', 'To', 'CC', 'BCC']

export function groupEmailParticipants(participants = []) {
  const groups = Object.fromEntries(EMAIL_PARTICIPANT_ROLES.map((role) => [role, []]))
  const seen = new Set()

  for (const participant of participants) {
    const role = EMAIL_PARTICIPANT_ROLES.includes(participant?.role) ? participant.role : 'To'
    const email = String(participant?.email || '').trim().toLowerCase()
    if (!email) continue
    const key = `${role}:${email}`
    if (seen.has(key)) continue
    seen.add(key)
    groups[role].push(participant)
  }

  return groups
}
