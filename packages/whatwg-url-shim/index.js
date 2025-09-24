'use strict';

const { URL, URLSearchParams, domainToASCII, domainToUnicode } = require('node:url');

if (typeof URL !== 'function') {
  throw new Error('URL constructor is not available in this version of Node.js');
}

module.exports = {
  URL,
  URLSearchParams,
  /**
   * Older versions of whatwg-url also exposed helper functions from tr46.
   * Re-export Node equivalents so dependent libraries keep working without
   * reaching for the deprecated punycode module.
   */
  domainToASCII: typeof domainToASCII === 'function' ? domainToASCII : undefined,
  domainToUnicode: typeof domainToUnicode === 'function' ? domainToUnicode : undefined
};
