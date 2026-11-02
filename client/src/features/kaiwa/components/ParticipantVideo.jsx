import { Icon } from '../../../components/ui/controls.jsx';

/** @param {{name: string, self: boolean, camera: boolean, paused: boolean}} props */
export function ParticipantVideo({ name, self, camera, paused }) {
  return (
    <section
      className={`ck-video ${self ? 'ck-video--self' : ''}`}
      aria-label={self ? 'Video của bạn' : 'Video bạn luyện'}
    >
      <span className="ck-video-state">
        {paused
          ? 'Đang kết nối lại'
          : camera
            ? 'Camera bật · mẫu'
            : 'Camera tắt'}
      </span>
      <span className="ck-video-avatar" aria-hidden="true">
        {name[0]}
      </span>
      <div className="ck-video-name">
        <span>
          {name}
          <small>{self ? 'Bạn' : 'Bạn luyện'}</small>
        </span>
        <Icon name="mic" size={15} />
      </div>
    </section>
  );
}
