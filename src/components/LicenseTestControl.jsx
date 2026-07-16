import { LICENSE_OVERRIDES, useLicenseTest } from '../context/LicenseTestContext'

/**
 * Testing-only widget pinned to the bottom-left corner. Shows the license type
 * detected on authentication and lets a tester force any of the possible views.
 */
export default function LicenseTestControl() {
  const { override, setOverride, detectedLabel } = useLicenseTest()

  return (
    <div className="license-test" role="region" aria-label="License test control">
      <div className="license-test-row">
        <span className="license-test-tag">TEST</span>
        <span className="license-test-detected" title="License detected on sign-in">
          {detectedLabel}
        </span>
      </div>
      <label className="license-test-row license-test-select-row">
        <span className="license-test-label">View as</span>
        <select
          className="license-test-select"
          value={override}
          onChange={(e) => setOverride(e.target.value)}
        >
          {LICENSE_OVERRIDES.map((o) => (
            <option key={o.value || 'auto'} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
    </div>
  )
}
