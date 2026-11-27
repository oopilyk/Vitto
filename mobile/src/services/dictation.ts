import { useCallback, useEffect, useRef, useState } from 'react';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { holdMusic, releaseMusic } from './music';
import { stopPetVoice } from './petVoice';
import { dictationLanguage, t } from '../i18n';

/** Whether this phone or browser can turn speech into text at all. */
export const canDictate = (): boolean => {
  try {
    return ExpoSpeechRecognitionModule.isRecognitionAvailable();
  } catch {
    return false;
  }
};

/**
 * Speech into a text field: tap to start, talk, tap to stop. What has been
 * heard so far is handed to `onHeard` as it arrives (the whole of it each
 * time, not the new words), so the field can show the sentence forming and a
 * mishearing is fixed by typing before anything is sent.
 *
 * Speech becomes text on the phone where it can, so the audio never leaves
 * it. Permission is asked on the first tap, which only asks: nobody is
 * recorded mid-prompt.
 *
 * The recogniser's events reach every listener in the app (the pet's mic
 * button listens too), so everything here answers only to a session it started.
 */
export function useDictation(onHeard: (text: string) => void) {
  /** Asked to start. */
  const [listening, setListening] = useState(false);
  /** The mic is actually recording: only now is it worth talking. */
  const [ready, setReady] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const active = useRef(false);
  const heard = useRef(onHeard);
  heard.current = onHeard;

  useSpeechRecognitionEvent('audiostart', () => {
    if (active.current) setReady(true);
  });
  useSpeechRecognitionEvent('result', (event) => {
    if (active.current) heard.current(event.results[0]?.transcript ?? '');
  });
  useSpeechRecognitionEvent('error', (event) => {
    // Silence and a stop are not failures worth a word.
    if (!active.current || event.error === 'no-speech' || event.error === 'aborted') return;
    setProblem(event.error === 'not-allowed' ? t('Allow the microphone in Settings to talk.') : t('Could not hear that. Try again.'));
  });
  useSpeechRecognitionEvent('end', () => {
    if (!active.current) return;
    active.current = false;
    setListening(false);
    setReady(false);
    void releaseMusic();
  });

  const start = useCallback(async () => {
    if (active.current) return;
    setProblem(null);
    const permission = await ExpoSpeechRecognitionModule.getPermissionsAsync().catch(() => null);
    if (!permission?.granted) {
      const asked = await ExpoSpeechRecognitionModule.requestPermissionsAsync().catch(() => null);
      setProblem(asked?.granted ? t('Tap the mic again and talk.') : t('Allow the microphone in Settings to talk.'));
      return;
    }
    holdMusic();
    // The pet mid-sentence would be heard instead of the person.
    stopPetVoice();
    active.current = true;
    setListening(true);
    let onDevice = false;
    try {
      onDevice = ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
    } catch {
      // Unknown: let the system choose.
    }
    ExpoSpeechRecognitionModule.start({
      lang: dictationLanguage(),
      interimResults: true,
      // A list of foods has pauses in it: stop when told to, not at the first one.
      continuous: true,
      addsPunctuation: true,
      requiresOnDeviceRecognition: onDevice,
    });
  }, []);

  const stop = useCallback(() => {
    if (active.current) ExpoSpeechRecognitionModule.stop();
  }, []);

  // Leaving the page mid-sentence stops the mic with it.
  useEffect(
    () => () => {
      if (!active.current) return;
      active.current = false;
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        // Nothing was running after all.
      }
      void releaseMusic();
    },
    [],
  );

  return { listening, ready, problem, start, stop };
}
