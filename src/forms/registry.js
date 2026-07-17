import LeadForm from '../components/forms/LeadForm'
import OpportunityForm from '../components/forms/OpportunityForm'

/**
 * Registry of standalone forms.
 *
 * These forms render outside the Dynamics/Dataverse auth gate and are reachable
 * via the hash route `#/forms/<id>`. To add a new form, create its component and
 * append an entry here — no other wiring is required.
 *
 * @typedef {Object} FormDefinition
 * @property {string} id           Unique route id (used in `#/forms/<id>`).
 * @property {string} title        Page title shown in the header.
 * @property {string} icon         DataMinerIcons ligature name.
 * @property {string} [description] Short description of the form.
 * @property {React.ComponentType<{ onDone?: () => void }>} component Form component.
 */

/** @type {FormDefinition[]} */
export const FORMS = [
  {
    id: 'lead',
    title: 'Add lead',
    icon: 'person_add',
    description: 'Submit a new sales lead.',
    component: LeadForm,
  },
  {
    id: 'opportunity',
    title: 'Add opportunity',
    icon: 'lightbulb',
    description: 'Submit a new sales opportunity.',
    component: OpportunityForm,
  },
]

/**
 * Look up a form definition by id.
 * @param {string} id
 * @returns {FormDefinition | null}
 */
export function getForm(id) {
  return FORMS.find((f) => f.id === id) || null
}
