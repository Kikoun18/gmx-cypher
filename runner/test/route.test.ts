// Where the page is (R9a): every view at an address of its own, the old tabs' addresses redirected, ids checked;
// and a drop split by what each file is (routeDrop).
import { describe, expect, it } from 'vitest';
import { formatRoute, parseRoute, type Route } from '../src/lib/route';
import { dropSummary, routeDrop } from '../src/lib/drop';

const ID = 'jmk2abcd1x9z', ID2 = 'jmk2abcf00aa';

describe('addresses', () => {
  const cases: [string, Route, boolean][] = [
    // Each view at its own address, read as written.
    ['#setup/inputs', { view: 'setup', step: 'inputs', batch: false }, false],
    ['#setup/groups', { view: 'setup', step: 'groups', batch: false }, false],
    ['#setup/command', { view: 'setup', step: 'command', batch: false }, false],
    ['#setup/inputs?mode=batch', { view: 'setup', step: 'inputs', batch: true }, false],
    ['#setup/command?mode=batch', { view: 'setup', step: 'command', batch: true }, false],
    ['#results', { view: 'results', job: null }, false],
    ['#results/' + ID, { view: 'results', job: ID }, false],
    ['#compare', { view: 'compare', jobs: [] }, false],
    ['#compare?jobs=' + ID, { view: 'compare', jobs: [ID] }, false],
    ['#compare?jobs=' + ID + ',' + ID2, { view: 'compare', jobs: [ID, ID2] }, false],
    ['#cluster', { view: 'cluster' }, false],
    // The tabs' old addresses open what they opened, and are written again in the new form.
    ['#inputs', { view: 'setup', step: 'inputs', batch: false }, true],
    ['#groups', { view: 'setup', step: 'groups', batch: false }, true],
    ['#analysis', { view: 'setup', step: 'command', batch: false }, true],
    ['#rdf', { view: 'setup', step: 'command', batch: false }, true],
    ['#jobs', { view: 'results', job: null }, true],
    ['#batch', { view: 'setup', step: 'inputs', batch: true }, true],
    // No address: the first step.
    ['', { view: 'setup', step: 'inputs', batch: false }, true],
    ['#', { view: 'setup', step: 'inputs', batch: false }, true],
    // Anything else falls back, and is written again; a bad id is dropped, never passed on.
    ['#nowhere', { view: 'setup', step: 'inputs', batch: false }, true],
    ['#setup/nowhere', { view: 'setup', step: 'inputs', batch: false }, true],
    ['#setup', { view: 'setup', step: 'inputs', batch: false }, true],
    ['#results/../etc', { view: 'results', job: null }, true],
    ['#results/ABC123', { view: 'results', job: null }, true],
    ['#results/abc', { view: 'results', job: null }, true],
    ['#results/' + 'a'.repeat(33), { view: 'results', job: null }, true],
    ['#results/' + ID + '/more', { view: 'results', job: null }, true],
    ['#compare?jobs=' + ID + ',<script>,' + ID2, { view: 'compare', jobs: [ID, ID2] }, true],
    ['#compare?jobs=' + ID + ',' + ID, { view: 'compare', jobs: [ID] }, true],
    ['#compare?jobs=', { view: 'compare', jobs: [] }, true],
    ['#compare?other=1', { view: 'compare', jobs: [] }, true],
    ['#setup/inputs?mode=other', { view: 'setup', step: 'inputs', batch: false }, true],
    ['#cluster/' + ID, { view: 'cluster' }, true],
  ];
  it.each(cases)('%s', (hash, route, redirect) => {
    expect(parseRoute(hash)).toEqual({ route, redirect });
  });

  it('a route written and read again is the same route, and needs no redirect', () => {
    for (const [, route] of cases) {
      const hash = formatRoute(route);
      expect(parseRoute(hash)).toEqual({ route, redirect: false });
    }
  });

  it('writes each view at its address', () => {
    expect(formatRoute({ view: 'setup', step: 'groups', batch: false })).toBe('#setup/groups');
    expect(formatRoute({ view: 'setup', step: 'inputs', batch: true })).toBe('#setup/inputs?mode=batch');
    expect(formatRoute({ view: 'results', job: null })).toBe('#results');
    expect(formatRoute({ view: 'results', job: ID })).toBe('#results/' + ID);
    expect(formatRoute({ view: 'compare', jobs: [] })).toBe('#compare');
    expect(formatRoute({ view: 'compare', jobs: [ID, ID2] })).toBe('#compare?jobs=' + ID + ',' + ID2);
    expect(formatRoute({ view: 'cluster' })).toBe('#cluster');
  });

  it('never writes an id it would not read', () => {
    expect(formatRoute({ view: 'results', job: 'Bad Id' })).toBe('#results');
    expect(formatRoute({ view: 'compare', jobs: [ID, 'x/y'] })).toBe('#compare?jobs=' + ID);
  });
});

describe('routeDrop', () => {
  const cases: [string, string[], { inputs: string[]; compare: string[]; left: string[] }][] = [
    ['inputs of a run go to inputs', ['md.xtc', 'md.tpr', 'md.gro', 'index.ndx', 'ener.edr'], { inputs: ['md.xtc', 'md.tpr', 'md.gro', 'index.ndx', 'ener.edr'], compare: [], left: [] }],
    ['trr, tng and pdb too', ['a.trr', 'b.tng', 'c.pdb'], { inputs: ['a.trr', 'b.tng', 'c.pdb'], compare: [], left: [] }],
    ['results go to compare', ['rdf.xvg', 'rdf.run.json'], { inputs: [], compare: ['rdf.xvg', 'rdf.run.json'], left: [] }],
    // A structure or an index dropped with results is theirs: compare reads them to draw the groups.
    ['a structure and index with results go with them', ['rdf/rdf.xvg', 'rdf/rdf.run.json', 'md.gro', 'index.ndx'], { inputs: [], compare: ['rdf/rdf.xvg', 'rdf/rdf.run.json', 'md.gro', 'index.ndx'], left: [] }],
    ['a mixed drop is split', ['md.xtc', 'md.tpr', 'rdf.xvg', 'md.gro'], { inputs: ['md.xtc', 'md.tpr'], compare: ['rdf.xvg', 'md.gro'], left: [] }],
    ['extensions in any case', ['MD.XTC', 'RDF.XVG'], { inputs: ['MD.XTC'], compare: ['RDF.XVG'], left: [] }],
    ['anything else is left, with the reason', ['notes.txt', 'md.log', 'state.cpt', 'other.json', 'md.xtc'], { inputs: ['md.xtc'], compare: [], left: ['notes.txt', 'md.log', 'state.cpt', 'other.json'] }],
    ['hidden files are left', ['.DS_Store', 'md.xtc'], { inputs: ['md.xtc'], compare: [], left: ['.DS_Store'] }],
    // A folder's inputs are not uploaded: a simulation's folder can hold gigabytes, and is better picked where it is.
    ['a dropped folder\'s inputs are left', ['sim/md.xtc', 'sim/md.tpr', 'sim/rdf/rdf.xvg', 'sim/md.gro'], { inputs: [], compare: ['sim/rdf/rdf.xvg', 'sim/md.gro'], left: ['sim/md.xtc', 'sim/md.tpr'] }],
    ['a folder of inputs alone is left', ['sim/md.gro', 'sim/md.xtc'], { inputs: [], compare: [], left: ['sim/md.gro', 'sim/md.xtc'] }],
    ['nothing', [], { inputs: [], compare: [], left: [] }],
  ];
  it.each(cases)('%s', (_, names, want) => {
    const r = routeDrop(names);
    expect({ inputs: r.inputs, compare: r.compare, left: r.left.map(l => l.name) }).toEqual(want);
    for (const l of r.left) expect(l.why).toMatch(/\w/);
  });

  it('says where each file went', () => {
    expect(dropSummary(routeDrop(['md.xtc', 'md.tpr', 'rdf.xvg', 'notes.txt']))).toBe('2 files to inputs: md.xtc, md.tpr · 1 file to compare: rdf.xvg · not read: notes.txt (not a file gmx-cypher reads)');
    expect(dropSummary(routeDrop(['rdf.xvg']))).toBe('1 file to compare: rdf.xvg');
    expect(dropSummary(routeDrop(['sim/md.xtc', 'notes.txt']))).toBe('not read: md.xtc, notes.txt (in a dropped folder: pick it by its path in inputs; not a file gmx-cypher reads)');
    expect(dropSummary(routeDrop([]))).toBe('nothing to read in this drop');
    // A long list names three and counts the rest.
    expect(dropSummary(routeDrop(['a.xvg', 'b.xvg', 'c.xvg', 'd.xvg', 'e.xvg']))).toBe('5 files to compare: a.xvg, b.xvg, c.xvg and 2 more');
  });
});
