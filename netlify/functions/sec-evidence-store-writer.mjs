// EG-20C-6B: modern Netlify Functions runtime entry for the SEC evidence
// store writer. The route is derived from this file's base name and stays
// /.netlify/functions/sec-evidence-store-writer. No config export — routing
// and method handling remain inside the core handler.
import { withLambda } from '@netlify/aws-lambda-compat';
import core from './lib/sec-evidence-store-writer-core.js';

export default withLambda(core.handler);
