'use client';

import { useRef, useState } from 'react';

interface DropzoneProps {
  accept: string[];
  multiple: boolean;
  label: string;
  onFiles: (files: File[]) => void;
}

export function Dropzone({ accept, multiple, label, onFiles }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div
      data-testid="dropzone"
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onFiles(Array.from(e.dataTransfer.files));
      }}
      className={`flex flex-col items-center justify-center gap-5 border-2 border-dashed border-brand px-4 py-16 transition-colors md:py-20 ${
        over ? 'bg-red-50' : ''
      }`}
    >
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="rounded-sm bg-brand px-10 py-6 text-xl font-bold text-white shadow-sm transition-colors hover:bg-brand-dark md:px-16 md:text-2xl"
      >
        SELECT {label}
      </button>
      <p className="font-semibold text-gray-400">Or drag and drop here</p>
      <input
        ref={inputRef}
        type="file"
        hidden
        accept={accept.join(',')}
        multiple={multiple}
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
    </div>
  );
}
