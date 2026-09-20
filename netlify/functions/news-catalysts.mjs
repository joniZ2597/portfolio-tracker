// S1: modern Netlify Functions runtime entry for the news-catalysts core.
// The route derives from this file's base name and stays
// /.netlify/functions/news-catalysts. No config export — the only trigger is
// a manual, token-bearing POST decided inside the core handler (Owner ruling
// D5); this file adds zero logic.
// The side-effect '@netlify/blobs' import below is a precedent-based bundling
// pin: every shipped .mjs wrapper (sec-evidence-pull.mjs,
// sec-evidence-store-writer.mjs, fund-facts.mjs, fund-facts-read.mjs) carries
// it so the core's lazy blobs require survives function bundling. This route's
// own Netlify bundle, runtime registration, and branch deploy have NOT been
// verified — that belongs to a separately approved DEV deploy step. Do not
// remove the import.
import '@netlify/blobs';
import { withLambda } from '@netlify/aws-lambda-compat';
import core from './lib/news-catalysts-core.js';

export default withLambda(core.handler);
