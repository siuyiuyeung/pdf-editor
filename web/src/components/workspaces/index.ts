import type { ComponentType } from 'react';
import type { ToolEngine } from '@/lib/pdf/run';
import type { PdfToolError } from '@/lib/pdf/errors';
import type { InputFile } from '@/lib/pdf/types';
import { EditWorkspace } from './EditWorkspace';
import { ImageToPdfWorkspace } from './ImageToPdfWorkspace';
import { MergeWorkspace } from './MergeWorkspace';
import { PdfToJpgWorkspace, PdfToPngWorkspace } from './PdfToImageWorkspace';
import { RotateWorkspace } from './RotateWorkspace';
import { SignWorkspace } from './SignWorkspace';
import { SplitWorkspace } from './SplitWorkspace';
import { WatermarkWorkspace } from './WatermarkWorkspace';

export interface WorkspaceProps {
  inputs: InputFile[];
  onInputsChange: (files: InputFile[]) => void;
  onAddFiles: (files: File[]) => void;
  run: (engine: ToolEngine, opts: unknown) => void;
  /** Shows an error card above the workspace, e.g. for a bad image picked inside the workspace. */
  onError: (error: PdfToolError) => void;
  busy: boolean;
}

export const WORKSPACES: Record<string, ComponentType<WorkspaceProps>> = {
  'merge-pdf': MergeWorkspace,
  'split-pdf': SplitWorkspace,
  'rotate-pdf': RotateWorkspace,
  'image-to-pdf': ImageToPdfWorkspace,
  'pdf-to-jpg': PdfToJpgWorkspace,
  'pdf-to-png': PdfToPngWorkspace,
  'watermark-pdf': WatermarkWorkspace,
  'sign-pdf': SignWorkspace,
  'edit-pdf': EditWorkspace,
};
