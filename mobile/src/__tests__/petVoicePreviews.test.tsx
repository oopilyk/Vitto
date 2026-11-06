import { PET_VOICES } from '@vitto/core';

const mockMade: string[] = [];
const mockPlayed: string[] = [];

jest.mock('../voice/kokoro', () => ({
  isModelDownloaded: () => true,
  warmUp: () => undefined,
  downloadModel: () => Promise.resolve(),
  deleteModel: () => undefined,
  MODEL_BYTES: 1,
  // One clip, as a plain async iterator: Babel's async generator helper is out of a mock's reach.
  speakToFiles: (_text: string, { name }: { name?: string }) => {
    mockMade.push(name ?? 'live');
    const clips = [{ uri: `${name ?? 'live'}-0.wav`, exists: true }];
    return {
      next: () => Promise.resolve(clips.length ? { value: clips.shift(), done: false } : { value: undefined, done: true }),
      [Symbol.asyncIterator]() {
        return this;
      },
    };
  },
}));

jest.mock('../services/music', () => ({ duckMusic: () => undefined, setQuietAudioSession: () => Promise.resolve() }));

jest.mock('expo-audio', () => ({
  createAudioPlayer: (uri: string) => {
    let listener: (status: { didJustFinish: boolean }) => void = () => undefined;
    return {
      addListener: (_event: string, fn: typeof listener) => {
        listener = fn;
        return { remove: () => undefined };
      },
      play: () => {
        mockPlayed.push(uri);
        listener({ didJustFinish: true });
      },
      remove: () => undefined,
    };
  },
}));

// eslint-disable-next-line import/first
import { preparePreviews, previewVoice } from '../services/petVoice';

const flush = async () => {
  for (let i = 0; i < 50; i += 1) await Promise.resolve();
};

describe('pet voice page previews', () => {
  it('makes every voice ahead, the pet’s own first, and plays the made one on a tap', async () => {
    const pet = { id: 'pet-1', voice: 'santa' as const };
    preparePreviews(pet);
    await flush();
    expect(mockMade).toEqual(['preview-santa', ...PET_VOICES.filter((v) => v !== 'santa').map((v) => `preview-${v}`)]);

    // Opening the page again makes nothing new.
    preparePreviews(pet);
    await flush();
    expect(mockMade).toHaveLength(PET_VOICES.length);

    await previewVoice(pet, 'deep');
    expect(mockPlayed).toEqual(['preview-deep-0.wav']);
    expect(mockMade).toHaveLength(PET_VOICES.length);
  });

  it('works the line out on the spot for a pet whose previews were not made', async () => {
    mockMade.length = 0;
    mockPlayed.length = 0;
    await previewVoice({ id: 'other-pet' }, 'female');
    expect(mockMade).toEqual(['live']);
    expect(mockPlayed).toEqual(['live-0.wav']);
  });
});
