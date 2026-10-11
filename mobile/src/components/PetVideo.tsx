import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect } from 'react';
import { AppState, Platform, View } from 'react-native';
import type { PetAnimation, PetSheet, PetVideoClip, PetVideos } from './petSprites';

/**
 * The clip a sheet plays for an animation, if it has one. iOS and web only:
 * Android's decoders do not reliably play either encoding transparent, so
 * Android keeps the sheet's frames.
 */
export const videoClipFor = (sheet: PetSheet, animation: PetAnimation): PetVideoClip | undefined =>
  Platform.OS === 'ios' || Platform.OS === 'web' ? sheet.videos?.clips[animation] : undefined;

/**
 * Safari plays HEVC with alpha but not VP9 with alpha; every other browser is
 * the other way round. Chrome and Edge also say "Safari" in their user agent,
 * so they are ruled out by name.
 */
const isSafari = () => {
  const agent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  return /Safari/.test(agent) && !/Chrome|Chromium|CriOS|Edg|Android/.test(agent);
};

// Only the web build carries `.webm` (see petClips); the phone plays the HEVC.
const sourceFor = (clip: PetVideoClip) => (Platform.OS === 'web' && !isSafari() && clip.webm ? clip.webm : clip.hevc);

interface Props {
  videos: PetVideos;
  clip: PetVideoClip;
  /** Same meaning as `SpriteFrame`'s: the window the pet is drawn into. */
  size: number;
  /** The sheet's `artScale`, so a clip sits exactly where the sheet's art would. */
  artScale?: number;
  /** Held on its current frame while the pet is out of sight (see PetAvatar). */
  paused?: boolean;
}

/**
 * Plays one animation clip in place of a sprite frame, muted, framed the way
 * `SpriteFrame` frames a cell: `videos.cell` is scaled to fill the cell, the
 * cell is pinned to the window's floor and centred, and the rest of the video
 * frame (transparent) hangs outside it.
 *
 * Mount it with a `key` per clip, so switching animation starts the new clip
 * from its first frame on a fresh player.
 */
export function PetVideo({ videos, clip, size, artScale = 1, paused = false }: Props) {
  const player = useVideoPlayer(sourceFor(clip), (created) => {
    created.loop = clip.loop;
    created.muted = true;
    // A silent pet must not pause whatever the user is listening to.
    created.audioMixingMode = 'mixWithOthers';
    created.play();
  });

  // On web the player only plays `<video>` elements already mounted, and the
  // setup call above runs before VideoView mounts its own; VideoView registers
  // it in its effect, which runs before this one.
  useEffect(() => {
    if (Platform.OS === 'web') player.play();
  }, [player]);

  // iOS pauses every player when the app goes to the background and nothing
  // starts it again, so the pet froze mid-pose after a trip out of the app.
  // Resume on return: a looping clip always, a play-once clip (a fall, a
  // slump) only if it had not reached its held last pose yet.
  useEffect(() => {
    const resume = () => {
      const finished = player.duration > 0 && player.currentTime >= player.duration - 0.05;
      if (clip.loop || !finished) player.play();
    };
    // Paused while another screen covers the pet; picked up where it was after.
    if (paused) player.pause();
    else resume();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !paused) resume();
    });
    return () => subscription.remove();
  }, [player, clip.loop, paused]);

  const cell = size * artScale;
  const scale = cell / videos.cell.size;
  const inset = size - cell;

  return (
    <View style={{ width: size, height: size, overflow: 'hidden' }} pointerEvents="none">
      <VideoView
        player={player}
        nativeControls={false}
        playsInline
        allowsPictureInPicture={false}
        contentFit="fill"
        style={{
          width: videos.frameSize * scale,
          height: videos.frameSize * scale,
          marginLeft: inset / 2 - videos.cell.x * scale,
          marginTop: inset - videos.cell.y * scale,
          backgroundColor: 'transparent',
        }}
      />
    </View>
  );
}
