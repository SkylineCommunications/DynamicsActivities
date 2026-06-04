import { useState, useEffect } from 'react'
import { useIsAuthenticated, useMsal } from '@azure/msal-react'
import { InteractionStatus } from '@azure/msal-browser'
import { loginRequest } from '../authConfig'
import { whoAmI } from '../api/dataverse'

export default function AuthGuard({ children }) {
  const { instance, inProgress } = useMsal()
  const isAuthenticated = useIsAuthenticated()
  const [currentUserId, setCurrentUserId] = useState(null)
  const [authError, setAuthError] = useState(null)

  // Handle any pending redirect response at startup
  useEffect(() => {
    instance.handleRedirectPromise().catch(() => {})
  }, [instance])

  // Trigger login if not authenticated and no in-flight interaction
  useEffect(() => {
    if (!isAuthenticated && inProgress === InteractionStatus.None) {
      instance.loginPopup(loginRequest).catch((e) => setAuthError(e.message))
    }
  }, [isAuthenticated, inProgress, instance])

  // Once authenticated, fetch current user ID from Dataverse
  useEffect(() => {
    if (isAuthenticated && !currentUserId) {
      whoAmI(instance)
        .then((r) => setCurrentUserId(r.UserId))
        .catch((e) => setAuthError(`Dataverse connection failed: ${e.message}`))
    }
  }, [isAuthenticated, instance, currentUserId])

  if (authError) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-icon">⚠️</div>
          <h2>Authentication error</h2>
          <p className="auth-error">{authError}</p>
          <button className="btn-primary" onClick={() => instance.loginPopup(loginRequest).catch(() => {})}>
            Retry login
          </button>
        </div>
      </div>
    )
  }

  if (!isAuthenticated || !currentUserId) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-spinner" />
          <p>{!isAuthenticated ? 'Signing in…' : 'Connecting to Dynamics…'}</p>
        </div>
      </div>
    )
  }

  return children(currentUserId)
}
