import { useEffect, useRef } from 'react';
import { Icon } from '../../../components/ui/controls.jsx';
import { Avatar } from '../../../components/ui/surfaces.jsx';

/** @param {{name: string, self: boolean, camera: boolean, paused: boolean, microphone?: boolean, videoTrack?: import('livekit-client').VideoTrack, audioTrack?: import('livekit-client').AudioTrack}} props */
export function ParticipantVideo({
  name,
  self,
  camera,
  paused,
  microphone,
  videoTrack,
  audioTrack,
}) {
  const video = useRef(/** @type {HTMLVideoElement|null} */ (null));
  const audio = useRef(/** @type {HTMLAudioElement|null} */ (null));
  useEffect(() => {
    const element = video.current;
    if (!element || !videoTrack) return;
    videoTrack.attach(element);
    return () => {
      videoTrack.detach(element);
    };
  }, [videoTrack]);
  useEffect(() => {
    const element = audio.current;
    if (self || !element || !audioTrack) return;
    audioTrack.attach(element);
    return () => {
      audioTrack.detach(element);
    };
  }, [audioTrack, self]);
  return (
    <section
      className={`ck-video ${self ? 'ck-video--self' : ''} ${camera ? 'ck-video--camera' : ''}`}
      aria-label={self ? 'Video của bạn' : 'Video bạn luyện'}
    >
      <video
        ref={video}
        className="ck-video-stream"
        autoPlay
        playsInline
        muted={self}
        hidden={!camera || !videoTrack}
      />
      {!self && <audio ref={audio} autoPlay />}
      <div className="ck-participant-details">
        <Avatar
          name={name}
          size={40}
          className={self ? '' : 'ck-avatar--partner'}
        />
        <div className="ck-participant-labels">
          <strong title={name}>{self ? 'Bạn' : name}</strong>
          <small className={paused ? 'ck-status--warning' : 'ck-status'}>
            {paused ? 'Đang kết nối lại' : 'Đã kết nối'}
          </small>
          {!self && (
            <div className="ck-participant-devices">
              <span
                aria-label={microphone ? 'Micro bật' : 'Micro tắt'}
                title={microphone ? 'Micro bật' : 'Micro tắt'}
              >
                <Icon name={microphone ? 'mic' : 'micOff'} size={16} />
              </span>
              <span
                aria-label={camera ? 'Camera bật' : 'Camera tắt'}
                title={camera ? 'Camera bật' : 'Camera tắt'}
              >
                <Icon name={camera ? 'camera' : 'cameraOff'} size={16} />
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
