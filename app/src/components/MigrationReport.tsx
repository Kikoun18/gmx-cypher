import { useState } from 'react';
import type { MigrationReport } from '../lib/storage/migration/migrate';
import { formatReport } from '../lib/storage/migration/migrate';
import { download } from '../lib/export';
import { plural } from './ui';

const p = { margin: 0, fontSize: 12, lineHeight: 1.8, color: 'var(--mut)' };
const plain = { padding: '10px 16px', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--bg)', fontSize: 12 };
const big = { padding: '11px 18px', border: 0, borderRadius: 10, background: 'var(--acc)', color: '#fff', fontWeight: 700, fontSize: 12, letterSpacing: '0.03em' };

/** What a migration did, whether its verification passed, and what to do next (spec §16.8–9). */
export function MigrationReportView({ report, vaultName, fromBrowser, onOpen, onRemoveLegacy }: {
  report: MigrationReport; vaultName: string; fromBrowser: boolean;
  onOpen: () => void; onRemoveLegacy: () => Promise<void>;
}) {
  const [armed, setArmed] = useState(false);
  const [removed, setRemoved] = useState<string | null>(null);
  const rec = report.projects.reduce((n, x) => n + x.reconstructed.length, 0);
  return (
    <div style={{ width: 'min(760px, 100%)', display: 'flex', flexDirection: 'column', gap: 14, padding: '30px 32px', background: 'var(--surf)', border: '1px solid ' + (report.ok ? 'var(--line)' : 'var(--acc)'), borderRadius: 20 }}>
      <div style={{ fontFamily: 'var(--arch)', fontWeight: 800, fontSize: 24 }}>{report.ok ? 'Migration verified' : 'Migration finished — verification found differences'}</div>
      <p style={p}>
        {plural(report.projects.length, 'project')} written to <strong style={{ color: 'var(--ink)' }}>{vaultName}</strong>, then read back from disk with a fresh load and compared with the old data
        {report.ok ? ' — every sequence, run, analysis, curve, structure, note, reference, page, column and setting matches.' : '. The differences are listed below. Your old browser data has not been changed.'}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflow: 'auto' }}>
        {report.projects.map(x => {
          const c = x.counts;
          return (
            <div key={x.id} style={{ padding: '10px 12px', border: '1px solid ' + (x.problems.length ? 'var(--acc)' : 'var(--line)'), borderRadius: 10, background: 'var(--bg)', fontSize: 11, lineHeight: 1.7 }}>
              <div style={{ fontWeight: 700, fontSize: 12 }}>{x.name} <span style={{ fontWeight: 400, color: 'var(--mut)' }}>· {x.problems.length ? 'differences found' : 'verified'}</span></div>
              <div style={{ color: 'var(--mut)' }}>{c.rows} sequences · {c.runs} runs · {c.analyses} analyses ({c.curves} curves) · {c.structures} structures · {c.rowNotes + c.cellNotes} notes · {c.literature} references · {c.pages} pages · {c.columns} columns</div>
              {x.reconstructed.length > 0 && <div style={{ color: 'var(--mut)' }}>{plural(x.reconstructed.length, 'reconstructed file')} (the old app kept only parsed numbers — these are marked <code>.reconstructed.xvg</code>, not originals)</div>}
              {x.structuresMissing.length > 0 && <div style={{ color: 'var(--accInk)' }}>Already missing in the old app, kept as missing: {x.structuresMissing.join(', ')}</div>}
              {x.problems.map((m, i) => <div key={i} style={{ color: 'var(--acc)' }}>{m}</div>)}
            </div>
          );
        })}
      </div>
      {report.warnings.length > 0 && (
        <div style={{ fontSize: 11, lineHeight: 1.7, color: 'var(--mut)' }}>
          <span className="lbl-wide">Notes</span>
          {report.warnings.map((w, i) => <div key={i}>{w}</div>)}
        </div>
      )}
      {rec > 0 && <p style={{ ...p, fontSize: 11 }}>The full list of reconstructed files is in the downloadable report.</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="h-bright" style={big} onClick={onOpen}>{report.ok ? 'Open the vault' : 'Open the vault anyway'}</button>
        <button className="h-surf" style={plain} onClick={() => download(new Blob([formatReport(report) + '\n\n' + JSON.stringify(report, null, 2)], { type: 'text/plain' }), 'pmf-migration-report.txt')}>Download report</button>
        <span style={{ flex: 1 }} />
        {fromBrowser && report.ok && !removed && (
          <button className="h-acc" style={{ ...plain, color: armed ? 'var(--acc)' : 'var(--mut)', borderColor: armed ? 'var(--acc)' : 'var(--line)' }}
            title="Deletes the old app's copy in this browser's storage. The vault is not affected."
            onClick={() => { if (!armed) { setArmed(true); return; } onRemoveLegacy().then(() => setRemoved('The old browser copy was removed.'), e => setRemoved('Could not remove it: ' + String((e as Error).message || e))); }}>
            {armed ? 'Really delete the old browser copy?' : 'Remove the old browser copy…'}
          </button>
        )}
        {removed && <span style={{ fontSize: 11, color: 'var(--mut)' }}>{removed}</span>}
      </div>
      {fromBrowser && <p style={{ ...p, fontSize: 11 }}>The old copy in this browser stays untouched unless you remove it here{report.ok ? '' : ' (only possible after a verified migration)'}.</p>}
    </div>
  );
}
