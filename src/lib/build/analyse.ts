// From built systems to analysis (R10): set-up's batch mode, filled with the base folder's solutions/ as its root and a
// path template that finds each system's trajectories by the notebook's names, as the cluster tab's offer fills it. The
// template's tokens are the Matrix's folder pattern's, so a batch names its results and lands them by the same fields.

import { BASE, NAMES } from './plan'

export type AnalyseWhat = 'walkers' | 'awh'
export const ANALYSE: Record<AnalyseWhat, { label: string; template: string }> = {
  walkers: { label: 'the walkers', template: '{method}/{column}/{seq}/' + NAMES.walkers + '/{run}/' + NAMES.walkers + '.xtc' },
  awh: { label: 'awh', template: '{method}/{column}/{seq}/' + NAMES.awh + '/' + NAMES.awh + '.xtc' },
}

/** The root and path template a batch over a build's systems starts from: nothing runs until set-up's run is pressed. */
export function analyseOffer(base: string, what: AnalyseWhat): { root: string; template: string } {
  return { root: base.replace(/\/+$/, '') + '/' + BASE.solutions, template: ANALYSE[what].template }
}
