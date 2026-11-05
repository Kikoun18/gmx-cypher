// A cluster job as a system's (R7b): qq jobs -e prints each job's input folder, the step folder its script was submitted
// from. A job whose folder ends in a system's step folder (solutions/<method>/<saccharide>/<sequence>/8.pull) is that
// system's, at that stage. Only the end is compared: the cluster prints the same folder as /mnt/storage-… or /storage/….

import { STEP_FOLDER } from './qq'
import type { StageId } from './plan'

export interface JobSystem { dir: string; stage: StageId }

export function jobSystem(inputDir: string | null | undefined, systems: { dir: string }[]): JobSystem | null {
  if (!inputDir) return null
  const d = inputDir.replace(/\/+$/, '')
  for (const s of systems) for (const [stage, folder] of Object.entries(STEP_FOLDER) as [StageId, string][])
    if (folder && (d.endsWith('/' + s.dir + '/' + folder) || d === s.dir + '/' + folder)) return { dir: s.dir, stage }
  return null
}
