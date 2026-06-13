const crypto = require("node:crypto");

// Read from backend/.env or use the one we saw
const JWT_SECRET = "kFHI67LuCx1VBZpErWhjl3zTSlSTJTtG2y4QoJZwULDi4Lun0TqpXKpGEWl3oS8xmODvWjAlyJ6Umdw==";
const JWT_EXPIRY = 7 * 24 * 60 * 60;

function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function signJWT(payload) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(
    JSON.stringify({ ...payload, iat: now, exp: now + JWT_EXPIRY }),
  );
  const sig = b64url(
    crypto
      .createHmac("sha256", JWT_SECRET)
      .update(`${header}.${body}`)
      .digest(),
  );
  return `${header}.${body}.${sig}`;
}

// Generate token for admin@admin.local (id cmpvm2avm0000qz36l57c1d7z)
const adminToken = signJWT({ sub: "cmpvm2avm0000qz36l57c1d7z" });
console.log('Admin Token:', adminToken);

// Generate token for ivan@example.com (id cmq71zgnw000amx2ya6y63i6f)
const ivanToken = signJWT({ sub: "cmq71zgnw000amx2ya6y63i6f" });
console.log('Ivan Token:', ivanToken);
