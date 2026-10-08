// DOI lookup for the Literature section. Crossref's public API answers CORS
// requests without a key; anything it can't resolve is simply filled by hand.

import { cleanDoi } from './seq';
import type { LitRef } from './types';

interface CrossrefWork {
  title?: string[];
  author?: { given?: string; family?: string; name?: string }[];
  issued?: { 'date-parts'?: number[][] };
  'container-title'?: string[];
  URL?: string;
  DOI?: string;
}

export async function lookupDoi(input: string): Promise<Partial<LitRef>> {
  const doi = cleanDoi(input);
  if (!doi) throw new Error('No DOI found — paste one like 10.1038/nsmb1201');
  const r = await fetch('https://api.crossref.org/works/' + encodeURIComponent(doi));
  if (!r.ok) throw new Error(r.status === 404 ? 'Crossref has no record of ' + doi : 'Crossref answered ' + r.status);
  const w = ((await r.json()) as { message: CrossrefWork }).message;
  const authors = (w.author || []).map(a => a.name || [a.family, a.given].filter(Boolean).join(', ')).filter(Boolean);
  const year = w.issued && w.issued['date-parts'] && w.issued['date-parts'][0] && w.issued['date-parts'][0][0];
  return {
    doi: w.DOI || doi,
    title: (w.title && w.title[0]) || '',
    authors: authors.join('; '),
    year: year ? String(year) : '',
    venue: (w['container-title'] && w['container-title'][0]) || '',
    url: w.URL || 'https://doi.org/' + doi,
  };
}

export const doiUrl = (doi: string) => 'https://doi.org/' + doi;
