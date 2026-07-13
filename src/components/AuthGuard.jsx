import { useState, useEffect } from 'react'
import { useIsAuthenticated, useMsal } from '@azure/msal-react'
import { InteractionStatus } from '@azure/msal-browser'
import { appBasePath, loginRequest, redirectPathname } from '../authConfig'
import { assertDataverseAppAccess, whoAmI } from '../api/dataverse'
import { getUserHasDynamicsLicense } from '../api/graph'
import { bootstrapSession, isDataMinerHost } from '../api/dataminer'

const LICENSE_REQUEST_TO = 'IT@skyline.be'
const LICENSE_REQUEST_CC = 'squad.maximize-amplify@skyline.be'
const APP_NAME = 'Dynamics Activities'
const REQUESTED_LICENSE = 'Dynamics 365 Sales Team Member'

function buildLicenseRequestMailto() {
  const subject = `[License Request] ${APP_NAME}`
  const body = [
    'Hello IT team,',
    '',
    `I would like to request a ${REQUESTED_LICENSE} license for access to ${APP_NAME}.`,
    'Please also grant access to the sandbox environment with the team-member-qa role.',
    '',
    'Thanks.',
  ].join('\n')

  return `mailto:${LICENSE_REQUEST_TO}?cc=${encodeURIComponent(LICENSE_REQUEST_CC)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

function looksLikeDynamicsAccessDenied(err) {
  const msg = String(err?.message || '').toLowerCase()
  return (
    msg.includes('insufficient')
    || msg.includes('permission')
    || msg.includes('access is denied')
    || msg.includes('prv')
    || msg.includes('license')
    || msg.includes('authorization has been denied')
    || msg.includes('not a member of the organization')
    || msg.includes('0x80072560')
  )
}

export default function AuthGuard({ children, onDmaConnection }) {
  const { instance, inProgress } = useMsal()
  const isAuthenticated = useIsAuthenticated()
  const [currentUserId, setCurrentUserId] = useState(null)
  const [licenseChecked, setLicenseChecked] = useState(false)
  const [hasLicense, setHasLicense] = useState(false)
  const [authError, setAuthError] = useState(null)
  const [needsManualLogin, setNeedsManualLogin] = useState(false)
  const [dmaReady, setDmaReady] = useState(!isDataMinerHost()) // skip DMA check on localhost

  // Step 1: On DataMiner host, verify the DMA session cookie first
  useEffect(() => {
    if (!isDataMinerHost()) {
      onDmaConnection?.(null)
      return
    }

    bootstrapSession({ redirectOnFailure: true })
      .then((conn) => {
        onDmaConnection?.(conn)
        setDmaReady(true)
        if (!conn) {
          setAuthError('DataMiner session is required. Please sign in via the DataMiner authentication page.')
        }
      })
      .catch(() => {
        onDmaConnection?.(null)
        setDmaReady(true)
        setAuthError('DataMiner session verification failed. Please sign in again.')
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Handle any pending redirect response at startup
  useEffect(() => {
    instance
      .handleRedirectPromise()
      .then(() => {
        if (window.location.pathname === redirectPathname) {
          window.history.replaceState({}, '', appBasePath)
        }
      })
      .catch(() => {})
  }, [instance])

  // Step 2: Once DMA is ready, try MSAL silent login.
  // On DataMiner host, user already signed in via Entra — try silent first.
  // On localhost, require a user gesture to open the popup.
  useEffect(() => {
    if (!dmaReady) return
    if (isAuthenticated || inProgress !== InteractionStatus.None) return

    if (isDataMinerHost()) {
      // Try silent SSO — user already signed in via DataMiner's Entra flow
      const accounts = instance.getAllAccounts()
      if (accounts.length) return // MSAL will pick up cached tokens
      instance.ssoSilent(loginRequest).catch(() => {
        // Silent failed — need popup consent
        setNeedsManualLogin(true)
      })
    } else {
      setNeedsManualLogin(true)
    }
  }, [dmaReady, isAuthenticated, inProgress, instance])

  // Clear transient states once authentication succeeds
  useEffect(() => {
    if (isAuthenticated) {
      setAuthError(null)
      setNeedsManualLogin(false)
    } else {
      setCurrentUserId(null)
      setLicenseChecked(false)
      setHasLicense(false)
    }
  }, [isAuthenticated])

  // Step 3: Once MSAL authenticated, fetch current user and validate Dynamics license.
  useEffect(() => {
    if (!isAuthenticated || licenseChecked) return

    getUserHasDynamicsLicense(instance)
      .then((licensed) => {
        setHasLicense(licensed)
        setLicenseChecked(true)

        // Only attempt Dataverse sign-in for users that have a Dynamics license.
        if (!licensed) return

        return whoAmI(instance)
          .then((whoAmIResult) => {
            setCurrentUserId(whoAmIResult.UserId)
            return assertDataverseAppAccess(instance)
          })
          .catch((e) => {
            if (looksLikeDynamicsAccessDenied(e)) {
              setCurrentUserId(null)
              setHasLicense(false)
              return
            }
            throw e
          })
      })
      .catch((e) => setAuthError(`Authentication check failed: ${e.message}`))
  }, [isAuthenticated, instance, licenseChecked])

  function handleLogin() {
    setAuthError(null)
    setNeedsManualLogin(false)
    instance.loginPopup(loginRequest).catch((e) => {
      setAuthError(e.message)
      setNeedsManualLogin(true)
    })
  }

  // Waiting for DataMiner session verification
  if (!dmaReady) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-spinner" />
          <p>Verifying DataMiner session…</p>
        </div>
      </div>
    )
  }

  if (authError) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-icon"><span className="icon icon-lg" aria-hidden="true">warning</span></div>
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
          <div className="auth-icon"><span className="icon icon-lg" aria-hidden="true">lock</span></div>
          <h2>Sign in required</h2>
          <p>Sign in with your Microsoft account to access Dynamics 365.</p>
          <button className="btn-primary" onClick={handleLogin}>
            <span className="icon icon-sm" aria-hidden="true">login</span> Sign in
          </button>
        </div>
      </div>
    )
  }

  if (!isAuthenticated || !licenseChecked) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-spinner" />
          <p>{!isAuthenticated ? 'Signing in…' : 'Checking license…'}</p>
        </div>
      </div>
    )
  }

  if (!hasLicense) {
    const mailtoHref = buildLicenseRequestMailto()
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-icon"><span className="icon icon-lg" aria-hidden="true">warning</span></div>
          <h2>No Dynamics access found</h2>
          <p>
            You need Dynamics access for this environment to use this app.
          </p>
          <a className="btn-primary" href={mailtoHref} style={{ alignSelf: 'center' }}>
            Request license for access
          </a>
        </div>
      </div>
    )
  }

  if (!currentUserId) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-spinner" />
          <p>Loading user profile…</p>
        </div>
      </div>
    )
  }

  return children(currentUserId)
}
