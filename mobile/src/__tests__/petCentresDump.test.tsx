import fs from 'fs';
import { PET_SHEETS } from '../components/petSprites';

// Step one of scripts/measurePetCentres.mjs: writes every form's sheet, frame
// map and clips out as JSON, which only the bundler can resolve. Skipped
// unless asked for: PET_CENTRES_DUMP=<file> npx jest petCentresDump
jest.mock('../components/petClips', () => ({ clipFiles: (key: string) => ({ hevc: key }) }));

const target = process.env.PET_CENTRES_DUMP;
const path = (source: unknown) =>
  source && typeof source === 'object' && 'testUri' in source ? (source as { testUri: string }).testUri : source;

(target ? it : it.skip)('writes the sheets out for measuring', () => {
  const forms = PET_SHEETS.flatMap((base) =>
    [['base', base] as const, ...Object.entries(base.evolutions ?? {})].map(([build, sheet]) => ({
      id: build === 'base' ? base.name : `${base.name}:${build}`,
      source: path(sheet!.source),
      columns: sheet!.columns ?? 4,
      rows: sheet!.rows ?? 11,
      artScale: sheet!.artScale ?? 1,
      animations: sheet!.animations,
      videos: sheet!.videos
        ? {
            frameSize: sheet!.videos.frameSize,
            cell: sheet!.videos.cell,
            clips: Object.fromEntries(Object.entries(sheet!.videos.clips).map(([animation, clip]) => [animation, clip!.hevc])),
          }
        : null,
    })),
  );
  fs.writeFileSync(target!, JSON.stringify(forms));
});
