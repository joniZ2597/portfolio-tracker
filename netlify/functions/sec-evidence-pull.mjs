// EG-20C Slice 2G: modern Netlify Functions runtime entry for the SEC evidence
// pull core. The route is derived from this file's base name and stays
// /.netlify/functions/sec-evidence-pull. No config export — routing and every
// request decision remain inside the core handler.
// EG-20C-6D pattern: static side-effect import — zisi's V2 transformer rewrites
// the core's lazy blobs require into an esbuild __require call that NFT cannot
// trace, so without this import the package is omitted from the deployed bundle
// (MODULE_NOT_FOUND at store acquisition once the gate is ON). Do not remove.
import '@netlify/blobs';
import { withLambda } from '@netlify/aws-lambda-compat';
import core from './lib/sec-evidence-pull-core.js';

export default withLambda(core.handler);
