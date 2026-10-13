import JSZip from 'jszip';
import type { OutputFile } from './pdf/types';

function uniqueName(name: string, used: Set<string>): string {
  let candidate = name;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let n = 2; used.has(candidate); n++) candidate = `${stem} (${n})${ext}`;
  used.add(candidate);
  return candidate;
}

export async function zipFiles(files: OutputFile[]): Promise<Uint8Array> {
  const zip = new JSZip();
  const used = new Set<string>();
  for (const f of files) zip.file(uniqueName(f.name, used), f.bytes);
  return zip.generateAsync({ type: 'uint8array' });
}
