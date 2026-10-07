// R-1 Slice B (B3): modern Netlify Functions runtime entry for the ATH write core.
// Route derives from this file's base name: /.netlify/functions/ath-write.
// No config export; every request decision lives in the core handler.
// The side-effect '@netlify/blobs' import is the same bundling pin carried by fund-facts.mjs so
// the core's lazy blobs require survives function bundling. This route's own bundle, runtime
// registration and branch deploy have NOT been verified yet (needs a separately approved DEV
// deploy step). Do not remove the import.
import '@netlify/blobs';
import { withLambda } from '@netlify/aws-lambda-compat';
import core from './lib/ath-write-core.js';

export default withLambda(core.handler);
