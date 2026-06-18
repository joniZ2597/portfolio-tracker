const { getStore } = require("@netlify/blobs");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json"
};

const STORE_NAME = "portfolio";
const BLOB_KEY = "portfolio-data";
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

  return whitelisted;
}

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: CORS_HEADERS,
      body: ""
    };
  }

  if (event.httpMethod !== "GET") {
    return json(405, "AUTH_FAILED");
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
