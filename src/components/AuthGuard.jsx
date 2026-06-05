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
  const [needsManualLogin, setNeedsManualLogin] = useState(false)

  // Handle any pending redirect response at startup
  useEffect(() => {
    instance.handleRedirectPromise().catch(() => {})
  }, [instance])

  // If not authenticated and idle, require a user gesture to open the popup.
  // Never auto-trigger loginPopup — browsers block popups not tied to a click.
  useEffect(() => {
    if (!isAuthenticated && inProgress === InteractionStatus.None) {
      setNeedsManualLogin(true)
    }
  }, [isAuthenticated, inProgress])

  // Clear transient states once authentication succeeds
  useEffect(() => {
    if (isAuthenticated) {
      setAuthError(null)
      setNeedsManualLogin(false)
    }
  }, [isAuthenticated])

  // Once authenticated, fetch current user ID from Dataverse
  useEffect(() => {
    if (isAuthenticated && !currentUserId) {
      whoAmI(instance)
        .then((r) => setCurrentUserId(r.UserId))
        .catch((e) => setAuthError(`Dataverse connection failed: ${e.message}`))
    }
  }, [isAuthenticated, instance, currentUserId])

  function handleLogin() {
    setAuthError(null)
    setNeedsManualLogin(false)
    instance.loginPopup(loginRequest).catch((e) => {
      setAuthError(e.message)
      setNeedsManualLogin(true)
    })
  }

  if (authError) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-icon">⚠️</div>
          <h2>Authentication error</h2>
          <p className="auth-error">{authError}</p>
          <button className="btn-primary" onClick={handleLogin}>
            Retry login
          </button>
        </div>
      </div>
    )
  }

  if (needsManualLogin) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-icon">🔐</div>
          <h2>Sign in required</h2>
          <p>Sign in with your Microsoft account to continue.</p>
          <button className="btn-primary" onClick={handleLogin}>
            Sign in
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
