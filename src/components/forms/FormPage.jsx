import { getForm } from '../../forms/registry'

/**
 * Generic shell for standalone form pages: app header with a back button,
 * the form title, and the form component itself. Renders any form registered
 * in ../../forms/registry.js.
 *
 * @param {{ formId: string, onBack: () => void }} props
 */
export default function FormPage({ formId, onBack }) {
  const form = getForm(formId)
  const FormComponent = form?.component

  return (
    <div className="app">
      <header className="app-header">
        <button type="button" className="btn-ghost" onClick={onBack}>
          <span className="icon icon-sm" aria-hidden="true">arrow_back</span> Back
        </button>
        <span className="header-title">{form ? form.title : 'Forms'}</span>
      </header>

      <main className="app-main">
        {FormComponent ? (
          <FormComponent onDone={onBack} />
        ) : (
          <div className="form-card">
            <div className="lead-success">
              <div className="auth-icon"><span className="icon icon-lg" aria-hidden="true">help</span></div>
              <h2>Form not found</h2>
              <p>The requested form does not exist.</p>
              <button type="button" className="btn-primary" onClick={onBack}>Go back</button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
