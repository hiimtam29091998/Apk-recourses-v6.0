/* All optimization is performed offline in this worker via HiGHS WASM. */
'use strict';
importScripts('./optimizer.js', './highs.js');
const ready = Module({ locateFile: (file) => new URL(file, self.location.href).href });
self.onmessage = async function(event) {
  const { id, config } = event.data || {};
  try {
    const highs = await ready;
    const result = self.KhoangThachSolver.optimize(config, (lp, options) => highs.solve(lp, options));
    self.postMessage({ id, ok: true, result });
  } catch (e) {
    self.postMessage({ id, ok: false, error: e && e.message ? e.message : String(e) });
  }
};
