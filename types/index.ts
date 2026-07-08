export type Rotation = 0 | 90 | 180 | 270;

export type PageDescriptor = {
  id: string;
  fileId: string; // "" for blank pages
  sourceIndex: number; // -1 for blank pages
  rotation: Rotation;
  isBlank: boolean;
};

export type SourceFile = {
  id: string;
  name: string;
  bytes: Uint8Array;
  pageCount: number;
};
