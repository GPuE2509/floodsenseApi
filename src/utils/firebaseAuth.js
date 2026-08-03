const https = require('https');
const jwt = require('jsonwebtoken');

let cachedKeys = null;
let keysExpiry = 0;

/**
 * Fetch Google's public certificates for Firebase ID tokens.
 * Caches them according to Cache-Control max-age header.
 */
async function getFirebasePublicKeys() {
  const now = Date.now();
  if (cachedKeys && now < keysExpiry) {
    return cachedKeys;
  }

  return new Promise((resolve, reject) => {
    https.get('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com', (res) => {
      let data = '';
      const cacheControl = res.headers['cache-control'];
      let maxAge = 3600; // default 1 hour
      if (cacheControl) {
        const match = cacheControl.match(/max-age=(\d+)/);
        if (match) {
          maxAge = parseInt(match[1], 10);
        }
      }

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          cachedKeys = JSON.parse(data);
          keysExpiry = Date.now() + (maxAge * 1000);
          resolve(cachedKeys);
        } catch (e) {
          reject(new Error('Failed to parse Google public keys'));
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Verify Firebase ID Token cryptographically.
 * Ref: https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library
 */
async function verifyFirebaseIdToken(idToken) {
  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded || !decoded.header || !decoded.header.kid) {
    throw new Error('Invalid token structure');
  }

  const kid = decoded.header.kid;
  const alg = decoded.header.alg;
  if (alg !== 'RS256') {
    throw new Error('Invalid token algorithm (must be RS256)');
  }

  const publicKeys = await getFirebasePublicKeys();
  const cert = publicKeys[kid];
  if (!cert) {
    throw new Error('Public key not found for the given kid');
  }

  const projectId = 'sftr-589d6';
  const options = {
    audience: projectId,
    issuer: `https://securetoken.google.com/${projectId}`,
    algorithms: ['RS256'],
  };

  return new Promise((resolve, reject) => {
    jwt.verify(idToken, cert, options, (err, payload) => {
      if (err) {
        reject(err);
      } else {
        resolve(payload);
      }
    });
  });
}

module.exports = {
  verifyFirebaseIdToken,
};
