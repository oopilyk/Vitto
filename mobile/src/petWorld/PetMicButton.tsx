import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import Svg, { Rect } from 'react-native-svg';
import { holdMusic, releaseMusic } from '../services/music';
import { fonts, themedStyles, world } from '../theme';
import { retro, retroPressed } from './retroStyle';

interface Props {
  petName: string;
  /** What was said, once the button is let go. Never called with nothing. */
  onSay: (text: string) => void;
  /** A reply is on its way: the button rests until it lands. */
  busy?: boolean;
  night?: boolean;
  size: number;
}

/** Shorter than this is a tap, not a sentence: it shows how to use the button instead. */
const MIN_HOLD_MS = 350;

/** Whether this phone or browser can turn speech into text at all. */
export const canListen = (): boolean => {
  try {
    return ExpoSpeechRecognitionModule.isRecognitionAvailable();
  } catch {
    return false;
  }
};

/**
 * Hold to talk to the pet. Speech becomes text on the phone (on the device
 * itself where it can, so the audio never leaves it); letting go sends the
 * text exactly as typing it in the chat would, and the reply comes back in
 * the pet's speech bubble. While held, what has been heard so far shows
 * beside the button, so a mishearing is caught before it is sent.
 *
 * Permission is asked on the first press, never before; that press only asks,
 * so nobody is recorded mid-prompt.
 */
export function PetMicButton({ petName, onSay, busy = false, night = false, size }: Props) {
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const heardRef = useRef('');
  const pressedAt = useRef(0);
  /** Let go before recognition started: stop as soon as it does. */
  const released = useRef(false);
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!listening) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [listening, pulse]);

  useEffect(() => {
    if (!hint) return;
    const timer = setTimeout(() => setHint(null), 2500);
    return () => clearTimeout(timer);
  }, [hint]);

  useSpeechRecognitionEvent('start', () => {
    if (released.current) ExpoSpeechRecognitionModule.stop();
  });
  useSpeechRecognitionEvent('result', (event) => {
    const text = event.results[0]?.transcript ?? '';
    heardRef.current = text;
    setHeard(text);
  });
  useSpeechRecognitionEvent('error', (event) => {
    // Silence and a let-go are not failures worth a word.
    if (event.error === 'no-speech' || event.error === 'aborted') return;
    setHint(event.error === 'not-allowed' ? 'Allow the microphone in Settings to talk.' : 'I could not hear that. Try again.');
  });
  useSpeechRecognitionEvent('end', () => {
    setListening(false);
    void releaseMusic();
    const text = heardRef.current.trim();
    heardRef.current = '';
    setHeard('');
    if (text && Date.now() - pressedAt.current >= MIN_HOLD_MS) onSay(text);
  });

  const begin = async () => {
    released.current = false;
    pressedAt.current = Date.now();
    setHint(null);
    const permission = await ExpoSpeechRecognitionModule.getPermissionsAsync().catch(() => null);
    if (!permission?.granted) {
      const asked = await ExpoSpeechRecognitionModule.requestPermissionsAsync().catch(() => null);
      setHint(asked?.granted ? 'Now hold the button and talk.' : 'Allow the microphone in Settings to talk.');
      return;
    }
    if (released.current) return;
    holdMusic();
    heardRef.current = '';
    setHeard('');
    setListening(true);
    let onDevice = false;
    try {
      onDevice = ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
    } catch {
      // Unknown: let the system choose.
    }
    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: true,
      continuous: true,
      addsPunctuation: true,
      requiresOnDeviceRecognition: onDevice,
    });
  };

  const end = () => {
    released.current = true;
    if (Date.now() - pressedAt.current < MIN_HOLD_MS && !heardRef.current) setHint('Hold to talk.');
    if (listening) ExpoSpeechRecognitionModule.stop();
  };

  const ring = { width: size, height: size, borderRadius: size / 2 };
  const glow = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const caption = listening ? heard || 'Listening…' : hint;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {caption ? (
        <View style={[retro.panel, night && retro.panelNight, styles.caption]} pointerEvents="none" testID="mic-caption">
          <Text style={[styles.captionText, night && styles.captionTextNight]} numberOfLines={3}>
            {caption}
          </Text>
        </View>
      ) : null}
      {listening ? <Animated.View style={[styles.halo, ring, { transform: [{ scale: glow }] }]} pointerEvents="none" /> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Hold to talk to ${petName}`}
        accessibilityState={{ busy, selected: listening }}
        disabled={busy}
        onPressIn={() => void begin()}
        onPressOut={end}
        hitSlop={6}
        testID="pet-mic"
        style={({ pressed }) => [
          retro.panel,
          night && retro.panelNight,
          styles.button,
          ring,
          (pressed || listening) && retroPressed,
          listening && styles.buttonOn,
          busy && styles.buttonBusy,
        ]}
      >
        <MicGlyph size={size * 0.46} color={listening ? world.accentDeep : night ? world.nightText : world.inkSoft} />
      </Pressable>
    </View>
  );
}

/** A microphone drawn on a pixel grid, to sit with the rest of the room's chrome. */
function MicGlyph({ size, color }: { size: number; color: string }) {
  // 10 x 13 cells: the capsule, its cradle, the stem and the foot.
  const cells: [number, number, number, number][] = [
    [3, 0, 4, 1], [2, 1, 6, 6], [3, 7, 4, 1],
    [0, 4, 1, 3], [9, 4, 1, 3], [1, 7, 1, 1], [8, 7, 1, 1], [2, 8, 6, 1],
    [4, 9, 2, 2], [2, 11, 6, 2],
  ];
  return (
    <Svg width={size} height={size * 1.3} viewBox="0 0 10 13">
      {cells.map(([x, y, w, h]) => (
        <Rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} fill={color} />
      ))}
    </Svg>
  );
}

const styles = themedStyles(() => ({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  button: { alignItems: 'center', justifyContent: 'center' },
  buttonOn: { backgroundColor: world.accentWash },
  buttonBusy: { opacity: 0.55 },
  halo: { position: 'absolute', backgroundColor: world.accentWash, opacity: 0.6 },
  // To the left of the button, so it reads beside the column rather than over the room.
  caption: {
    position: 'absolute',
    right: '100%',
    marginRight: 10,
    width: 200,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  captionText: { fontFamily: fonts.systemMono, fontSize: 13, lineHeight: 18, color: world.ink },
  captionTextNight: { color: world.nightText },
}));
