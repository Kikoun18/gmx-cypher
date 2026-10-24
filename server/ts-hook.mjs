// The Matrix's sources are written for Vite and import `./pmf` without an extension, which Node refuses.
// This adds `.ts` to such relative imports, so they load unchanged (T1).
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (e) {
    if (e?.code !== 'ERR_MODULE_NOT_FOUND' || !/^\.\.?\//.test(specifier) || /\.[cm]?[jt]sx?$/.test(specifier)) throw e;
    return next(specifier + '.ts', context);
  }
}
