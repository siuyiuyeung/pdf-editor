import type { ComponentType } from 'react';
import type { EngineName } from '@/lib/pdf/engines';
import type { InputFile } from '@/lib/pdf/types';
import { MergeWorkspace } from './MergeWorkspace';

export interface WorkspaceProps {
  inputs: InputFile[];
  onInputsChange: (files: InputFile[]) => void;
  onAddFiles: (files: File[]) => void;
  run: (engine: EngineName, opts: unknown) => void;
  busy: boolean;
}

export const WORKSPACES: Record<string, ComponentType<WorkspaceProps>> = {
  'merge-pdf': MergeWorkspace,
};
