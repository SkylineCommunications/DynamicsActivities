import AuthGuard from '../AuthGuard'
import { getReviewForm } from '../../forms/registry'
import { navigate } from '../../hooks/useHashRoute'

/**
 * Generic shell for review pages: authenticated form pages for full-license users
 * to review and save Team member submissions to Dynamics.
 *
 * @param {{ reviewId: string }} props
 */
export default function ReviewPage({ reviewId }) {
  const form = getReviewForm(reviewId)
  const FormComponent = form?.component

  const handleBack = () => navigate('')

  return (
    <AuthGuard>
      {() => (
        <div className="app">
          <header className="app-header">
            <button type="button" className="btn-ghost" onClick={handleBack}>
              <span className="icon icon-sm" aria-hidden="true">arrow_back</span> Back
            </button>
            <span className="header-title">{form ? form.title : 'Review'}</span>
          </header>

          <main className="app-main">
            {FormComponent ? (
              <FormComponent onDone={handleBack} />
            ) : (
              <div className="form-card">
                <div className="auth-error-container">
                  <div className="auth-icon">
                    <span className="icon icon-lg" aria-hidden="true">help</span>
                  </div>
                  <h2>Review page not found</h2>
                  <p>The requested review page does not exist.</p>
                  <button type="button" className="btn-primary" onClick={handleBack}>
                    Go back
                  </button>
                </div>
              </div>
            )}
          </main>
        </div>
      )}
    </AuthGuard>
  )
}
