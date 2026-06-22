'use strict';

const SERVER_GATE = 'PT_ENABLE_RESEARCH_EVIDENCE_SERVER';

exports.handler = async function (event) {
  if (process.env[SERVER_GATE] !== 'true') {
    return res(200, { status: 'DISABLED', reason: 'SERVER_DISABLED' });
  }

  const method = event && event.httpMethod;

  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: cors(), body: '' };
  }

  if (method === 'GET' || method === 'POST') {
    return res(200, { status: 'NOT_INVOKED', reason: 'SCAFFOLD_ONLY' });
  }

  return res(405, { status: 'ERROR', reason: 'METHOD_NOT_ALLOWED' });
};

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };
}

function res(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...cors() },
    body: JSON.stringify(body)
  };
}
