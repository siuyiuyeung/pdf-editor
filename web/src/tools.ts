export type ToolGroup = 'word' | 'image' | 'powerpoint' | 'excel' | 'organize' | 'compress' | 'edit' | 'sign';

export interface ToolDef {
  slug: string;
  title: string;
  subtitle: string;
  group: ToolGroup;
  accept: string[];
  multiple: boolean;
  engine: 'client' | 'server';
  available: boolean;
}

const PDF = ['.pdf'];

// Order matches the reference tools grid.
export const TOOLS: ToolDef[] = [
  { slug: 'pdf-to-word', title: 'Convert PDF to Word', subtitle: 'Turn a PDF into an editable DOCX', group: 'word', accept: PDF, multiple: false, engine: 'server', available: false },
  { slug: 'word-to-pdf', title: 'Convert Word to PDF', subtitle: 'Convert DOC and DOCX files to PDF', group: 'word', accept: ['.doc', '.docx'], multiple: false, engine: 'server', available: false },
  { slug: 'pdf-to-jpg', title: 'Convert PDF to JPG', subtitle: 'Save each page as a JPG image', group: 'image', accept: PDF, multiple: false, engine: 'client', available: true },
  { slug: 'image-to-pdf', title: 'Convert JPG/PNG to PDF', subtitle: 'Combine images into one PDF', group: 'image', accept: ['.jpg', '.jpeg', '.png'], multiple: true, engine: 'client', available: true },
  { slug: 'pdf-to-png', title: 'Convert PDF to PNG', subtitle: 'Save each page as a PNG image', group: 'image', accept: PDF, multiple: false, engine: 'client', available: true },
  { slug: 'powerpoint-to-pdf', title: 'Convert PowerPoint to PDF', subtitle: 'Convert PPT and PPTX files to PDF', group: 'powerpoint', accept: ['.ppt', '.pptx'], multiple: false, engine: 'server', available: false },
  { slug: 'excel-to-pdf', title: 'Convert Excel to PDF', subtitle: 'Convert XLS and XLSX files to PDF', group: 'excel', accept: ['.xls', '.xlsx'], multiple: false, engine: 'server', available: false },
  { slug: 'split-pdf', title: 'Split PDF', subtitle: 'Extract pages or split into several files', group: 'organize', accept: PDF, multiple: false, engine: 'client', available: true },
  { slug: 'merge-pdf', title: 'Merge PDF', subtitle: 'Combine PDFs in the order you want', group: 'organize', accept: PDF, multiple: true, engine: 'client', available: true },
  { slug: 'compress-pdf', title: 'Compress PDF', subtitle: 'Reduce PDF file size', group: 'compress', accept: PDF, multiple: false, engine: 'server', available: false },
  { slug: 'edit-pdf', title: 'Edit PDF', subtitle: 'Add text, shapes, images and highlights', group: 'edit', accept: PDF, multiple: false, engine: 'client', available: false },
  { slug: 'watermark-pdf', title: 'Watermark PDF', subtitle: 'Stamp text or an image on your pages', group: 'edit', accept: PDF, multiple: false, engine: 'client', available: false },
  { slug: 'rotate-pdf', title: 'Rotate PDF', subtitle: 'Rotate one page or all of them', group: 'edit', accept: PDF, multiple: false, engine: 'client', available: true },
  { slug: 'sign-pdf', title: 'Sign PDF', subtitle: 'Draw, type or upload your signature', group: 'sign', accept: PDF, multiple: false, engine: 'client', available: false },
];

export function getTool(slug: string): ToolDef | undefined {
  return TOOLS.find((t) => t.slug === slug);
}

const KIND: Record<string, string> = {
  '.pdf': 'PDF',
  '.doc': 'WORD',
  '.docx': 'WORD',
  '.xls': 'EXCEL',
  '.xlsx': 'EXCEL',
  '.ppt': 'POWERPOINT',
  '.pptx': 'POWERPOINT',
};

/** Label for the "SELECT … " button, e.g. "PDF FILE", "PDF FILES", "IMAGES". */
export function acceptLabel(tool: ToolDef): string {
  const kind = KIND[tool.accept[0]];
  if (!kind) return 'IMAGES';
  return `${kind} ${tool.multiple ? 'FILES' : 'FILE'}`;
}
