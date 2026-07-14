import { useState, useEffect } from 'react'

/**
 * Minimal hash-based router — no external dependency.
 * A "route" is the string after `#/`, e.g. `forms/lead` for `#/forms/lead`.
 */
export function getHashRoute() {
  return window.location.hash.replace(/^#\/?/, '')
}

/**
 * Navigate to a hash route. Pass an empty string to return to the app root.
 * @param {string} route Route without the leading `#/` (e.g. `forms/lead`).
 */
export function navigate(route) {
  window.location.hash = route ? `#/${route}` : ''
}

/**
 * React hook that returns the current hash route and re-renders on change.
 */
export default function useHashRoute() {
  const [route, setRoute] = useState(getHashRoute)

  useEffect(() => {
    const onChange = () => setRoute(getHashRoute())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  return route
}
