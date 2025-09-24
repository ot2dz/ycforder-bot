import Module from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const appliedSymbol = Symbol.for('whatwg-url-shim-applied');
const moduleAny = Module as typeof Module & { [appliedSymbol]?: boolean };

if (!moduleAny[appliedSymbol]) {
  const shimPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../packages/whatwg-url-shim/index.js'
  );

  const originalResolveFilename = Module._resolveFilename;

  Module._resolveFilename = function patchedResolveFilename(
    request: string,
    parent: NodeModule | undefined,
    isMain: boolean,
    options?: { paths?: string[] }
  ) {
    if (request === 'whatwg-url') {
      return shimPath;
    }

    return originalResolveFilename.call(this, request, parent, isMain, options);
  } as typeof Module._resolveFilename;

  moduleAny[appliedSymbol] = true;
}
