const mockInvoke = jest.fn();
jest.mock('../services/supabaseClient', () => ({
  supabase: {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u' } } }) },
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
  },
}));

const mockResize = jest.fn();
const mockSaveAsync = jest.fn();
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: {
    manipulate: () => ({ resize: mockResize, renderAsync: () => Promise.resolve({ saveAsync: mockSaveAsync }) }),
  },
}));

import { analyzeMealImage, shrinkForUpload } from '../services/mealAnalysis';

const networkError = () => Object.assign(new Error('Failed to send a request to the Edge Function'), { name: 'FunctionsFetchError' });
const ok = {
  data: {
    analysis: {
      grade: 'A',
      summary: 'Balanced.',
      confidence: 0.8,
      detectedFoods: ['rice'],
      macros: { calories: 400, proteinGrams: 20, carbsGrams: 50, fatGrams: 10 },
      nutrients: { protein: true },
    },
  },
  error: null,
};
const photo = { uri: 'file://plate.jpg', base64: 'abc', mimeType: 'image/jpeg' };

describe('sending a meal photo', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockInvoke.mockReset();
  });
  afterEach(() => jest.useRealTimers());

  const run = async (promise: Promise<unknown>) => {
    const settled = promise.then((value) => ({ value }), (error) => ({ error }));
    await jest.runAllTimersAsync();
    return settled;
  };

  it('retries once when the upload breaks, and uses the second answer', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: networkError() }).mockResolvedValueOnce(ok);
    const result = (await run(analyzeMealImage(photo))) as { value?: { grade: string } };
    expect(mockInvoke).toHaveBeenCalledTimes(2);
    expect(result.value?.grade).toBe('A');
  });

  it('says to check the connection when the retry breaks too', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: networkError() });
    const result = (await run(analyzeMealImage(photo))) as { error?: Error };
    expect(mockInvoke).toHaveBeenCalledTimes(2);
    expect(result.error?.message).toMatch(/check your connection/i);
  });

  it('does not retry an answer from the server', async () => {
    const refused = Object.assign(new Error('non-2xx'), { name: 'FunctionsHttpError' });
    mockInvoke.mockResolvedValue({ data: null, error: refused });
    await run(analyzeMealImage(photo));
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });
});

describe('shrinking a photo before it is sent', () => {
  beforeEach(() => {
    mockResize.mockReset();
    mockSaveAsync.mockReset().mockResolvedValue({ base64: 'small' });
  });

  it('brings the longest side down to 1024', async () => {
    await shrinkForUpload({ ...photo, width: 3024, height: 4032 });
    expect(mockResize).toHaveBeenCalledWith({ height: 1024 });
    await shrinkForUpload({ ...photo, width: 4032, height: 3024 });
    expect(mockResize).toHaveBeenLastCalledWith({ width: 1024 });
  });

  it('leaves a small photo its size and sends the re-encoded bytes', async () => {
    const shrunk = await shrinkForUpload({ ...photo, width: 800, height: 600 });
    expect(mockResize).not.toHaveBeenCalled();
    expect(shrunk).toEqual({ uri: photo.uri, base64: 'small', mimeType: 'image/jpeg' });
  });

  it('sends the original when the phone cannot shrink it', async () => {
    mockSaveAsync.mockRejectedValue(new Error('no'));
    expect(await shrinkForUpload({ ...photo, width: 4000, height: 3000 })).toEqual(photo);
  });
});
