import LeadForm from '../components/forms/LeadForm'
import OpportunityForm from '../components/forms/OpportunityForm'
import LeadReview from '../components/forms/LeadReview'
import OpportunityReview from '../components/forms/OpportunityReview'

/**
 * Registry of standalone forms.
 *
 * These forms render outside the Dynamics/Dataverse auth gate and are reachable
 * via the hash route `#/forms/<id>`. To add a new form, create its component and
 * append an entry here — no other wiring is required.
 *
 * Review forms (e.g., LeadReview, OpportunityReview) require Dynamics authentication
 * and are accessed via `#/review/<type>?data=...`.
 *
 * @typedef {Object} FormDefinition
 * @property {string} id           Unique route id (used in `#/forms/<id>`).
 * @property {string} title        Page title shown in the header.
 * @property {string} icon         DataMinerIcons ligature name.
 * @property {string} [description] Short description of the form.
 * @property {React.ComponentType<{ onDone?: () => void }>} component Form component.
 * @property {boolean} [requiresAuth] Whether the form requires Dynamics authentication.
 */

/** @type {FormDefinition[]} */
export const FORMS = [
  {
    id: 'lead',
    title: 'Add lead',
    icon: 'person_add',
    description: 'Submit a new sales lead.',
    component: LeadForm,
    requiresAuth: false,
  },
  {
    id: 'opportunity',
    title: 'Add opportunity',
    icon: 'lightbulb',
    description: 'Submit a new sales opportunity.',
    component: OpportunityForm,
    requiresAuth: false,
  },
]

/** @type {FormDefinition[]} */
export const REVIEW_FORMS = [
  {
    id: 'lead',
    title: 'Review lead',
    icon: 'person_add',
    description: 'Review and save lead to Dynamics.',
    component: LeadReview,
    requiresAuth: true,
  },
  {
    id: 'opportunity',
    title: 'Review opportunity',
    icon: 'lightbulb',
    description: 'Review and save opportunity to Dynamics.',
    component: OpportunityReview,
    requiresAuth: true,
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

/**
 * Look up a review form definition by id.
 * @param {string} id
 * @returns {FormDefinition | null}
 */
export function getReviewForm(id) {
  return REVIEW_FORMS.find((f) => f.id === id) || null
}
