import { Platform } from 'react-native';
import type { View } from 'react-native';
import type { RefObject } from 'react';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { SHARE_CARD_HEIGHT, SHARE_CARD_SCALE, SHARE_CARD_WIDTH } from '../components/PetShareCard';

/**
 * Turning the card on screen into a PNG and handing it to the system.
 *
 * One button, both of the things a person means by "share": the native sheet
 * carries Messages, Mail and WhatsApp for sending it, and "Save Image" for
 * keeping it. Doing it this way also avoids ever asking for photo-library
 * permission — the system writes the file, not us.
 */

export type ShareOutcome = 'shared' | 'unavailable' | 'failed';

/** A filename a person will recognise in Files or a chat thread. */
const filenameFor = (petName: string): string => {
  const slug = petName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${slug || 'pet'}-vitto.png`;
};

/**
 * Captures the card and opens the share sheet.
 *
 * Capture is at `SHARE_CARD_SCALE`, so the file is far larger than the preview
 * without the preview having to be. Returns rather than throws: a share sheet
 * the person swipes away is not an error, and neither is a platform without one.
 */
export const sharePetCard = async (
  card: RefObject<View | null>,
  petName: string,
): Promise<ShareOutcome> => {
  if (!card.current) return 'failed';
  try {
    if (!(await Sharing.isAvailableAsync())) return 'unavailable';
    const uri = await captureRef(card, {
      format: 'png',
      quality: 1,
      result: 'tmpfile',
      width: SHARE_CARD_WIDTH * SHARE_CARD_SCALE,
      height: SHARE_CARD_HEIGHT * SHARE_CARD_SCALE,
      // Without this an image on a transparent pixel comes out black on Android.
      ...(Platform.OS === 'android' ? { snapshotContentContainer: false } : {}),
    });
    await Sharing.shareAsync(uri, {
      mimeType: 'image/png',
      UTI: 'public.png',
      dialogTitle: `${petName} on Vitto`,
    });
    return 'shared';
  } catch (error) {
    console.warn('[share] could not share the card', error);
    return 'failed';
  }
};

export const shareCardFilename = filenameFor;
