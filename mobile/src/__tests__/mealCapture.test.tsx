import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { MealCaptureScreen } from '../screens/MealCaptureScreen';

const asset = {
  uri: 'file:///tmp/plate.jpg',
  base64: 'aGVsbG8=',
  mimeType: 'image/jpeg',
};

import * as ImagePicker from 'expo-image-picker';

// jest-expo already substitutes its own stand-in for every expo module, so a
// jest.mock factory gets overridden. Redefining the members wins either way.
const mockLaunchLibrary = jest.fn();
const mockLaunchCamera = jest.fn();
const stub = (name: string, value: unknown) =>
  Object.defineProperty(ImagePicker, name, { value, writable: true, configurable: true });

stub('launchImageLibraryAsync', mockLaunchLibrary);
stub('launchCameraAsync', mockLaunchCamera);
stub('requestCameraPermissionsAsync', jest.fn(async () => ({ granted: true })));
stub('requestMediaLibraryPermissionsAsync', jest.fn(async () => ({ granted: true })));

jest.mock('expo-camera', () => ({
  __esModule: true,
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: false }, jest.fn()],
}));

const press = (tree: renderer.ReactTestRenderer, label: string) => {
  const button = tree.root
    .findAll((node) => typeof node.props.onPress === 'function')
    .find((node) => node.findAllByType(Text).some((text: any) => text.props.children === label));
  if (!button) throw new Error(`No pressable labelled "${label}"`);
  return button;
};

describe('meal capture', () => {
  beforeEach(() => {
    mockLaunchLibrary.mockReset();
    mockLaunchLibrary.mockResolvedValue({ canceled: false, assets: [asset] });
    mockLaunchCamera.mockReset();
    mockLaunchCamera.mockResolvedValue({ canceled: false, assets: [asset] });
  });

  it('asks the picker for the image bytes, not just a file path', async () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <MealCaptureScreen
          onComplete={async () => {}}
          onFeedStart={() => {}}
          onAnalyzingChange={() => {}}
          onClose={() => {}}
        />,
      );
    });

    await act(async () => {
      await press(tree, 'Choose from library').props.onPress();
    });

    // base64 is what lets the upload skip reading the file back off disk, which
    // needs native APIs that are missing from some Expo Go builds.
    expect(mockLaunchLibrary).toHaveBeenCalledTimes(1);
    expect(mockLaunchLibrary.mock.calls[0][0]).toMatchObject({ base64: true });
    tree.unmount();
  });

});
