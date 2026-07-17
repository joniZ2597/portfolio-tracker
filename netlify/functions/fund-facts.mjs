// C1-S4: modern Netlify Functions runtime entry for the fund-facts core
// (C1-S3). The route derives from this file's base name and stays
// /.netlify/functions/fund-facts. No config export — routing and every request
// decision remain inside the core handler; this file adds zero logic.
// The side-effect '@netlify/blobs' import below is a precedent-based bundling
// pin: both shipped wrappers (sec-evidence-pull.mjs and
// sec-evidence-store-writer.mjs) carry it so the core's lazy blobs require
// survives function bundling, and it is validated offline by the FR-series
// route suite. This new route's own Netlify bundle, runtime registration, and
// branch deploy have NOT been verified yet — that verification belongs to a
// separately approved DEV deploy QA step. Do not remove the import.
import '@netlify/blobs';
import { withLambda } from '@netlify/aws-lambda-compat';
import core from './lib/fund-facts-core.js';

export default withLambda(core.handler);
