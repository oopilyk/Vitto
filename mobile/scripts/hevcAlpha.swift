// Re-encodes a movie as HEVC with alpha at a chosen quality, which avconvert's
// presets cannot do (PresetHEVCHighestQualityWithAlpha is the only alpha
// preset that re-encodes, and it is several times larger than the pet clips
// need). Apple's encoder is the only one that writes alpha iOS will play.
//
//   swift scripts/hevcAlpha.swift <in.mov> <out.mov> [quality 0-1, default 0.5]
//
// Frames, timing and size are kept; only the compression changes. Used by
// compressAssets.mjs and buildLifterVideos.mjs. macOS only.
import AVFoundation
import VideoToolbox

let args = CommandLine.arguments
guard args.count >= 3 else {
  FileHandle.standardError.write("usage: hevcAlpha.swift <in.mov> <out.mov> [quality]\n".data(using: .utf8)!)
  exit(2)
}
let input = URL(fileURLWithPath: args[1])
let output = URL(fileURLWithPath: args[2])
let quality = args.count > 3 ? Double(args[3]) ?? 0.5 : 0.5
try? FileManager.default.removeItem(at: output)

let asset = AVURLAsset(url: input)
let done = DispatchSemaphore(value: 0)
var failure: String?

Task {
  do {
    guard let track = try await asset.loadTracks(withMediaType: .video).first else { throw NSError(domain: "hevcAlpha", code: 1, userInfo: [NSLocalizedDescriptionKey: "no video track"]) }
    let size = try await track.load(.naturalSize)
    let transform = try await track.load(.preferredTransform)

    let reader = try AVAssetReader(asset: asset)
    let readerOutput = AVAssetReaderTrackOutput(track: track, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
    readerOutput.alwaysCopiesSampleData = false
    reader.add(readerOutput)

    let writer = try AVAssetWriter(outputURL: output, fileType: .mov)
    let writerInput = AVAssetWriterInput(mediaType: .video, outputSettings: [
      AVVideoCodecKey: AVVideoCodecType.hevcWithAlpha,
      AVVideoWidthKey: Int(size.width),
      AVVideoHeightKey: Int(size.height),
      AVVideoCompressionPropertiesKey: [
        AVVideoQualityKey: quality,
        kVTCompressionPropertyKey_TargetQualityForAlpha as String: quality,
      ],
    ])
    writerInput.transform = transform
    writerInput.expectsMediaDataInRealTime = false
    writer.add(writerInput)
    writer.shouldOptimizeForNetworkUse = true

    reader.startReading()
    writer.startWriting()
    writer.startSession(atSourceTime: .zero)
    while let sample = readerOutput.copyNextSampleBuffer() {
      while !writerInput.isReadyForMoreMediaData { try await Task.sleep(nanoseconds: 2_000_000) }
      if !writerInput.append(sample) { throw writer.error ?? NSError(domain: "hevcAlpha", code: 2) }
    }
    if reader.status == .failed { throw reader.error ?? NSError(domain: "hevcAlpha", code: 3) }
    writerInput.markAsFinished()
    await writer.finishWriting()
    if writer.status != .completed { throw writer.error ?? NSError(domain: "hevcAlpha", code: 4) }
  } catch {
    failure = "\(error)"
  }
  done.signal()
}
done.wait()
if let failure {
  FileHandle.standardError.write("hevcAlpha: \(failure)\n".data(using: .utf8)!)
  exit(1)
}
