// T1-C1: Netlify Functions runtime entry for the fund-facts READ core.
// Route derives from this file's base name: /.netlify/functions/fund-facts-read.
// No config export; every request decision lives in the core handler.
import '@netlify/blobs';
import { withLambda } from '@netlify/aws-lambda-compat';
import core from './lib/fund-facts-read-core.js';

export default withLambda(core.handler);
