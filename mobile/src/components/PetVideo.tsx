import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';
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
  /** Called once this clip's first frame is on screen (see PetClipStack). */
  onFirstFrame?: () => void;
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
export function PetVideo({ videos, clip, size, artScale = 1, paused = false, onFirstFrame }: Props) {
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
        onFirstFrameRender={onFirstFrame}
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

/**
 * The longest a new clip is kept hidden waiting for its first frame. Normally
 * that comes within a frame or two; this is only so a clip that never reports
 * one (an error, a quirk of the platform) still takes over rather than leaving
 * the pet stuck on the old pose.
 */
export const CLIP_SWAP_TIMEOUT_MS = 600;

interface Layer {
  key: string;
  clip: PetVideoClip;
}

/**
 * Switches the pet from one clip to the next without a blank frame between.
 *
 * A fresh player has nothing to show until it decodes its first frame, so
 * swapping clips outright left the pet invisible for a moment: the flash when a
 * celebration ended and the idle came back. Here the old clip stays on screen
 * while the new one starts underneath it, invisible, and the two trade places
 * the moment the new one has drawn. The incoming layer keeps its React identity
 * (its `key`) when it becomes the shown one, so its player is never restarted.
 */
export function PetClipStack({
  clipKey: animationKey,
  clip,
  ...rest
}: Omit<Props, 'onFirstFrame'> & { clipKey: string }) {
  // The file as well as the animation: a new form or breed on the same
  // animation is a different clip.
  const clipKey = `${animationKey}:${String(clip.hevc)}`;
  const [shown, setShown] = useState<Layer>({ key: clipKey, clip });
  const [incoming, setIncoming] = useState<Layer | null>(null);

  useEffect(() => {
    setIncoming(clipKey === shown.key ? null : { key: clipKey, clip });
    // `clip` follows `clipKey`; a new object for the same key is not a new clip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipKey, shown.key]);

  const takeOver = (layer: Layer) => {
    setShown(layer);
    setIncoming((current) => (current?.key === layer.key ? null : current));
  };

  useEffect(() => {
    if (!incoming) return;
    const timer = setTimeout(() => takeOver(incoming), CLIP_SWAP_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [incoming]);

  return (
    <View style={{ width: rest.size, height: rest.size }} pointerEvents="none">
      {[shown, incoming].map((layer) =>
        layer ? (
          <View key={layer.key} style={[StyleSheet.absoluteFill, { opacity: layer === incoming ? 0 : 1 }]}>
            <PetVideo {...rest} clip={layer.clip} onFirstFrame={layer === incoming ? () => takeOver(layer) : undefined} />
          </View>
        ) : null,
      )}
    </View>
  );
}
