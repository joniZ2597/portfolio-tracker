const { getStore, connectLambda } = require("@netlify/blobs");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Content-Type": "application/json"
};

const STORE_NAME = "portfolio";
const BLOB_KEY = "portfolio-data";
const MAX_BODY_BYTES = 256 * 1024;
const MAX_TICKERS = 200;
const SYMBOL_RE = /^[A-Z]{1,10}$/;
const WRITE_SOURCE = "portfolio-sync-write";
const QUERY_CREDENTIAL_KEYS = new Set([
  "token",
  "auth",
  "key",
  "apikey",
  "api_key",
  "secret"
]);

function json(statusCode, status, extra) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(Object.assign({ status }, extra || {}))
  };
}

function isValidUpdatedAt(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasQueryCredentials(event) {
  const params = event.queryStringParameters || {};
  return Object.keys(params).some((key) =>
    QUERY_CREDENTIAL_KEYS.has(String(key).toLowerCase())
  );
}

function getBearerToken(event) {
  const headers = event.headers || {};
  const authorization =
    headers.authorization ||
    headers.Authorization ||
    headers.AUTHORIZATION ||
    "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  return match ? match[1] : "";
}

function isValidServerDoc(doc) {
  if (!isPlainObject(doc) || doc.schemaVersion !== 1) {
    return false;
  }

  if (!isPlainObject(doc.holdings)) {
    return false;
  }

  if (
    Object.prototype.hasOwnProperty.call(doc, "updatedAt") &&
    !isValidUpdatedAt(doc.updatedAt)
  ) {
    return false;
  }

  const list = Array.isArray(doc.tickers)
    ? doc.tickers
    : Array.isArray(doc.watchlist)
      ? doc.watchlist
      : null;

  return Array.isArray(list) && list.length <= 200;
}

function whitelistServerDoc(doc) {
  const whitelisted = {
    schemaVersion: doc.schemaVersion,
    holdings: doc.holdings
  };

  if (Array.isArray(doc.tickers)) {
    whitelisted.tickers = doc.tickers;
  }

  if (Object.prototype.hasOwnProperty.call(doc, "appBaseline")) {
    whitelisted.appBaseline = doc.appBaseline;
  }

  if (Object.prototype.hasOwnProperty.call(doc, "sourceOrigin")) {
    whitelisted.sourceOrigin = doc.sourceOrigin;
  }

  if (Object.prototype.hasOwnProperty.call(doc, "updatedAt")) {
    whitelisted.updatedAt = doc.updatedAt;
  }

  return whitelisted;
}

// ── Write-side (PUT) helpers ────────────────────────────────────────────────
// All server-stamped; client-supplied provenance is ignored.

function getHeader(event, name) {
  const headers = event.headers || {};
  const lower = String(name).toLowerCase();
  for (const key of Object.keys(headers)) {
    if (String(key).toLowerCase() === lower) {
      return headers[key];
    }
  }
  return "";
}

function getRawBody(event) {
  if (event.isBase64Encoded) {
    return Buffer.from(event.body || "", "base64").toString("utf8");
  }
  return event.body || "";
}

function deriveSourceOrigin(event) {
  const host = String(getHeader(event, "host") || "").trim();
  if (!host) {
    return "";
  }
  const proto = String(getHeader(event, "x-forwarded-proto") || "https")
    .split(",")[0]
    .trim() || "https";
  return proto + "://" + host;
}

function getAppBaseline() {
  const ref = process.env.COMMIT_REF;
  return typeof ref === "string" && ref ? ref : "";
}

function normalizeSymbol(value) {
  if (typeof value !== "string") {
    return null;
  }
  const sym = value.trim().toUpperCase();
  return SYMBOL_RE.test(sym) ? sym : null;
}

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

// Server replica of the client's _normalizePosition whitelist.
function normalizePosition(p) {
  const has = !!(p && p.hasPosition === true);
  const toPosNum = (v) => {
    const n = typeof v === "string" ? parseFloat(v) : v;
    return typeof n === "number" && isFinite(n) && n > 0 ? n : null;
  };
  const toSignedNum = (v) => {
    const n = typeof v === "string" ? parseFloat(v) : v;
    return typeof n === "number" && isFinite(n) ? n : null;
  };
  return {
    hasPosition: has,
    positionValue: has ? toPosNum(p && p.positionValue) : null,
    pnlPercent: has ? toSignedNum(p && p.pnlPercent) : null,
    partialProfitTaken: has && !!(p && p.partialProfitTaken === true)
  };
}

// Validate and rebuild from a whitelist only. Returns { ok, holdings, tickers }.
// Any structural failure → { ok: false }. Drops every non-approved field.
function buildPersistedSubset(parsed) {
  if (!isPlainObject(parsed) || parsed.schemaVersion !== 1) {
    return { ok: false };
  }

  if (!isPlainObject(parsed.holdings)) {
    return { ok: false };
  }

  const holdings = {};
  const holdingVals = Object.values(parsed.holdings);
  for (let i = 0; i < holdingVals.length; i++) {
    const h = holdingVals[i];
    if (!isPlainObject(h)) {
      return { ok: false };
    }
    const sym = normalizeSymbol(h.symbol);
    if (!sym) {
      return { ok: false };
    }
    if (
      typeof h.positionSize !== "number" ||
      !isFinite(h.positionSize) ||
      h.positionSize <= 0
    ) {
      return { ok: false };
    }
    if (
      h.manualPlPct !== undefined &&
      h.manualPlPct !== null &&
      (typeof h.manualPlPct !== "number" || !isFinite(h.manualPlPct))
    ) {
      return { ok: false };
    }
    const entry = { symbol: sym, positionSize: h.positionSize };
    if (typeof h.manualPlPct === "number" && isFinite(h.manualPlPct)) {
      entry.manualPlPct = h.manualPlPct;
    }
    holdings[sym] = entry;
  }

  let rawTickers;
  if (parsed.tickers === undefined) {
    rawTickers = [];
  } else if (Array.isArray(parsed.tickers)) {
    rawTickers = parsed.tickers;
  } else {
    return { ok: false };
  }
  if (rawTickers.length > MAX_TICKERS) {
    return { ok: false };
  }

  const tickers = [];
  const seen = new Set();
  for (let j = 0; j < rawTickers.length; j++) {
    const t = rawTickers[j];
    if (!isPlainObject(t)) {
      return { ok: false };
    }
    const tsym = normalizeSymbol(t.symbol);
    if (!tsym) {
      return { ok: false };
    }
    if (seen.has(tsym)) {
      continue;
    }
    seen.add(tsym);
    tickers.push({
      symbol: tsym,
      name: trimString(t.name),
      exchange: trimString(t.exchange),
      sector: trimString(t.sector),
      sectorEtf: trimString(t.sectorEtf).toUpperCase(),
      personalNote: trimString(t.personalNote),
      position: normalizePosition(t.position)
    });
  }

  return { ok: true, holdings, tickers };
}

async function handlePut(event) {
  const contentType = String(getHeader(event, "content-type") || "").toLowerCase();
  if (!contentType.includes("application/json")) {
    return json(415, "UNSUPPORTED_MEDIA_TYPE");
  }

  const rawBody = getRawBody(event);
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return json(413, "PAYLOAD_TOO_LARGE");
  }

  let parsed;
  try {
    parsed = JSON.parse(rawBody);
  } catch (error) {
    return json(400, "BAD_REQUEST");
  }

  const built = buildPersistedSubset(parsed);
  if (!built.ok) {
    return json(422, "INVALID_INPUT_DOC");
  }

  const doc = {
    schemaVersion: 1,
    holdings: built.holdings,
    tickers: built.tickers,
    updatedAt: new Date().toISOString(),
    sourceOrigin: deriveSourceOrigin(event),
    source: WRITE_SOURCE,
    appBaseline: getAppBaseline()
  };

  try {
    const store = getStore(STORE_NAME);
    await store.setJSON(BLOB_KEY, doc);
  } catch (error) {
    console.error("portfolio-sync write failed", {
      message: error && error.message ? error.message : "unknown"
    });
    return json(500, "SERVER_ERROR");
  }

  return json(200, "OK", { updatedAt: doc.updatedAt, doc });
}

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: CORS_HEADERS,
      body: ""
    };
  }

  if (event.httpMethod !== "GET" && event.httpMethod !== "PUT") {
    return json(405, "METHOD_NOT_ALLOWED");
  }

  if (process.env.PT_ENABLE_PORTFOLIO_SYNC_SERVER !== "true") {
    return json(200, "DISABLED");
  }

  if (hasQueryCredentials(event)) {
    return json(401, "AUTH_FAILED");
  }

  const ownerToken = process.env.PT_OWNER_TOKEN;
  if (!ownerToken) {
    return json(500, "CONFIGURATION_MISSING");
  }

  if (getBearerToken(event) !== ownerToken) {
    return json(401, "AUTH_FAILED");
  }

  // connectLambda injects the Blobs context that legacy Lambda functions do not
  // receive ambiently. Run after gate + auth, before any getStore(); guarded by
  // event.blobs so an absent context falls through to the existing path.
  if (event.blobs) {
    try {
      connectLambda(event);
    } catch (error) {
      console.error("portfolio-sync blobs context init failed", {
        message: error && error.message ? error.message : "unknown"
      });
      return json(500, "SERVER_ERROR");
    }
  }

  if (event.httpMethod === "PUT") {
    return handlePut(event);
  }

  try {
    const store = getStore(STORE_NAME);
    const doc = await store.get(BLOB_KEY, { type: "json" });

    if (doc == null) {
      return json(404, "NOT_FOUND");
    }

    if (!isValidServerDoc(doc)) {
      return json(422, "INVALID_SERVER_DOC");
    }

    return json(200, "OK", {
      doc: whitelistServerDoc(doc)
    });
  } catch (error) {
    console.error("portfolio-sync read failed", {
      message: error && error.message ? error.message : "unknown"
    });

    return json(500, "SERVER_ERROR");
  }
};
