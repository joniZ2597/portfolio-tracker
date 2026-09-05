'use strict';

/*
 * Byte-level line-ending verifier (WFT-S1 / W3).
 *
 * Read-only and pure: it never writes, never exits the process, and never repairs a file.
 *
 * Counts are taken from raw bytes, one pass, never from decoded text and never by regex
 * over a string. A regex implementation double-counts: /\r/ and /\n/ each match inside a
 * CRLF pair, so a pure-CRLF file reports both CR and LF and misclassifies as MIXED. That
 * distinction is the entire point of this module, so the byte scan is not an optimization.
 *
 * A single backward look at buf[i-1] is enough to disambiguate, because CRLF is the only
 * two-byte terminator: an LF preceded by CR closes a CRLF pair, any other LF is bare, and
 * a CR not followed by LF is a bare (classic Mac) CR.
 *
 * Classification is NONE when a buffer holds no terminator at all - an empty file, or one
 * single line with no trailing newline. Reporting such a file as LF-ONLY or CRLF-ONLY
 * would assert a convention the bytes do not actually show.
 */

const fs = require('fs');

const LF = 0x0A;
const CR = 0x0D;

function classifyBuffer(buf) {
  if (!Buffer.isBuffer(buf)) {
    throw new TypeError('eol-verify: classifyBuffer expects a Buffer, received ' + typeof buf);
  }

  let lf = 0;
  let crlf = 0;
  let cr = 0;

  for (let i = 0; i < buf.length; i += 1) {
    const byte = buf[i];
    if (byte === LF) {
      if (i > 0 && buf[i - 1] === CR) {
        crlf += 1;
      } else {
        lf += 1;
      }
    } else if (byte === CR) {
      if (i + 1 >= buf.length || buf[i + 1] !== LF) {
        cr += 1;
      }
    }
  }

  const total = lf + crlf + cr;

  let classification;
  if (total === 0) {
    classification = 'NONE';
  } else if (crlf > 0 && lf === 0 && cr === 0) {
    classification = 'CRLF-ONLY';
  } else if (lf > 0 && crlf === 0 && cr === 0) {
    classification = 'LF-ONLY';
  } else {
    classification = 'MIXED';
  }

  const last = buf.length > 0 ? buf[buf.length - 1] : null;

  return {
    bytes: buf.length,
    lf: lf,
    crlf: crlf,
    cr: cr,
    total: total,
    classification: classification,
    endsWithNewline: last === LF || last === CR
  };
}

function classifyFile(filePath) {
  return classifyBuffer(fs.readFileSync(filePath));
}

module.exports = {
  classifyBuffer: classifyBuffer,
  classifyFile: classifyFile
};
