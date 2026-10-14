import {
  Crop, FileText, Image as ImageIcon, Merge, Minimize2, PenLine, Pencil, Presentation, RotateCw, Scissors, Sheet, Stamp,
  type LucideIcon,
} from 'lucide-react';
import type { ToolDef, ToolGroup } from '@/tools';

const GROUP_COLORS: Record<ToolGroup, string> = {
  word: '#3b7fc4',
  image: '#f5d547',
  powerpoint: '#f29b85',
  excel: '#6cc17a',
  organize: '#ee6a1a',
  compress: '#6b8e23',
  edit: '#9b5c9b',
  sign: '#1f5fbf',
};

const ICONS: Record<string, LucideIcon> = {
  'pdf-to-word': FileText,
  'word-to-pdf': FileText,
  'pdf-to-jpg': ImageIcon,
  'pdf-to-png': ImageIcon,
  'image-to-pdf': ImageIcon,
  'powerpoint-to-pdf': Presentation,
  'excel-to-pdf': Sheet,
  'split-pdf': Scissors,
  'merge-pdf': Merge,
  'compress-pdf': Minimize2,
  'edit-pdf': Pencil,
  'watermark-pdf': Stamp,
  'rotate-pdf': RotateCw,
  'crop-pdf': Crop,
  'sign-pdf': PenLine,
};

export function ToolIcon({ tool }: { tool: ToolDef }) {
  const Icon = ICONS[tool.slug] ?? FileText;
  const fg = tool.group === 'image' ? 'text-amber-900' : 'text-white';
  return (
    <span
      className="inline-flex h-11 w-11 items-center justify-center rounded-md"
      style={{ background: GROUP_COLORS[tool.group] }}
    >
      <Icon className={`h-6 w-6 ${fg}`} aria-hidden />
    </span>
  );
}
