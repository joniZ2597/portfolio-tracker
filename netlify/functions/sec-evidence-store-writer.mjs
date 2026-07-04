// EG-20C-6B: modern Netlify Functions runtime entry for the SEC evidence
// store writer. The route is derived from this file's base name and stays
// /.netlify/functions/sec-evidence-store-writer. No config export — routing
// and method handling remain inside the core handler.
// EG-20C-6D: static side-effect import — zisi's V2 transformer rewrites the
// core's lazy require('@netlify/blobs') into an esbuild __require call that
// NFT cannot trace, so without this import the package is omitted from the
// deployed bundle (MODULE_NOT_FOUND at store acquisition). Do not remove.
import '@netlify/blobs';
import { withLambda } from '@netlify/aws-lambda-compat';
import core from './lib/sec-evidence-store-writer-core.js';

export default withLambda(core.handler);
