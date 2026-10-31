import type { ComponentType } from 'react';
import {
  LuImage, LuFileText, LuFolderOpen, LuArchive, LuType, LuDatabase, LuAudioLines, LuVideo, LuCode, LuShieldCheck,
  LuSearch, LuStar, LuCopy, LuDownload, LuInfo, LuTriangleAlert, LuCircleCheck, LuCircleX, LuX, LuLock, LuTrash2,
  LuUpload, LuZap, LuEyeOff, LuCheck, LuRotateCcw, LuHistory, LuLayoutGrid, LuPlay, LuSparkles,
} from 'react-icons/lu';

export type Icon = ComponentType<{ size?: number; 'aria-hidden'?: boolean }>;

export const CATEGORY_ICONS: Record<string, Icon> = {
  image: LuImage, pdf: LuFileText, files: LuFolderOpen, archive: LuArchive, text: LuType,
  data: LuDatabase, audio: LuAudioLines, video: LuVideo, developer: LuCode, security: LuShieldCheck,
};

export const I = {
  search: LuSearch, star: LuStar, copy: LuCopy, download: LuDownload, info: LuInfo, warn: LuTriangleAlert,
  ok: LuCircleCheck, err: LuCircleX, close: LuX, lock: LuLock, trash: LuTrash2, upload: LuUpload, zap: LuZap,
  eyeOff: LuEyeOff, check: LuCheck, reset: LuRotateCcw, history: LuHistory, grid: LuLayoutGrid, play: LuPlay, sparkles: LuSparkles,
} satisfies Record<string, Icon>;
