import { degrees } from 'pdf-lib';
import { PdfToolError } from './errors';
import { baseName, loadPdf, single } from './load';
import { PDF_MIME, type Engine } from './types';

export type RotateOptions = { rotations: number[] };

export const rotate: Engine<RotateOptions> = async (inputs, { rotations }) => {
  const file = single(inputs);
  const doc = await loadPdf(file);
  const pages = doc.getPages();
  if (rotations.length !== pages.length || rotations.some((r) => !Number.isInteger(r) || r % 90 !== 0)) {
    throw new PdfToolError('BAD_OPTIONS', 'Each page rotation must be a multiple of 90 degrees');
  }
  pages.forEach((page, i) => {
    const next = (((page.getRotation().angle + rotations[i]) % 360) + 360) % 360;
    page.setRotation(degrees(next));
  });
  return [{ name: `${baseName(file.name)}-rotated.pdf`, bytes: await doc.save(), mime: PDF_MIME }];
};
