// S3-M1: Netlify Functions runtime entry for the news-catalysts READ core.
// Route derives from this file's base name: /.netlify/functions/news-catalysts-read.
// No config export; every request decision lives in the core handler.
// The side-effect '@netlify/blobs' import is the precedent-based bundling pin
// every shipped .mjs wrapper carries so the core's lazy blobs require survives
// function bundling. Do not remove the import.
import '@netlify/blobs';
import { withLambda } from '@netlify/aws-lambda-compat';
import core from './lib/news-catalysts-read-core.js';

export default withLambda(core.handler);
