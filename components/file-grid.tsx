'use client';

import { AnimatePresence } from 'framer-motion';
import FileCard from '@/components/file-card';
import type { FileItem } from '@/types';

interface FileGridProps {
  files: FileItem[];
  onRemove: (id: string) => void;
  onPreview: (id: string) => void;
}

export default function FileGrid({ files, onRemove, onPreview }: FileGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <AnimatePresence initial={false}>
        {files.map((item, index) => (
          <FileCard
            key={item.id}
            item={item}
            onRemove={onRemove}
            onPreview={onPreview}
            index={index % 8}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
