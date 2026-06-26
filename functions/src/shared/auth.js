/**
 * Validate an Entra (Azure AD) bearer token from the Authorization header.
 * Returns the decoded JWT payload with userId extracted from the `oid` claim.
 *
 * Uses JWKS to fetch public keys so no client secret is required.
 */

import jwt from 'jsonwebtoken'
import jwksClient from 'jwks-rsa'

const tenantId = process.env.ENTRA_TENANT_ID
const audience = process.env.ENTRA_AUDIENCE

const jwks = jwksClient({
  jwksUri: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 10 * 60 * 1000, // 10 minutes
})

function getSigningKey(header) {
  return new Promise((resolve, reject) => {
    jwks.getSigningKey(header.kid, (err, key) => {
      if (err) return reject(err)
      resolve(key.getPublicKey())
    })
  })
}

/**
 * Validate bearer token from an Azure Functions HttpRequest.
 * @returns {{ userId: string, email: string, name: string }} decoded claims
 * @throws {Error} if token is missing or invalid
 */
export async function requireAuth(request) {
  const authHeader = request.headers.get('authorization') || ''
  if (!authHeader.startsWith('Bearer ')) {
    throw Object.assign(new Error('Missing or malformed Authorization header'), { status: 401 })
  }
  const token = authHeader.slice(7)

  const decoded = await new Promise((resolve, reject) => {
    jwt.verify(
      token,
      async (header, callback) => {
        try {
          const key = await getSigningKey(header)
          callback(null, key)
        } catch (err) {
          callback(err)
        }
      },
      {
        audience,
        issuer: [
          `https://login.microsoftonline.com/${tenantId}/v2.0`,
          `https://sts.windows.net/${tenantId}/`,
        ],
        algorithms: ['RS256'],
      },
      (err, payload) => {
        if (err) reject(Object.assign(new Error('Invalid token: ' + err.message), { status: 401 }))
        else resolve(payload)
      },
    )
  })

  return {
    userId: decoded.oid,
    email: decoded.preferred_username || decoded.upn || decoded.email || '',
    name: decoded.name || '',
  }
}
