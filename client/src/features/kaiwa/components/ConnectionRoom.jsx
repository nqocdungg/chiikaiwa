import { useState } from 'react';
import { ConnectionState } from 'livekit-client';
import { Button, Icon } from '../../../components/ui/controls.jsx';
import { Dialog } from '../../../components/ui/Dialog.jsx';
import { LeaveDialog } from './LeaveDialog.jsx';

/** @param {{live: ReturnType<typeof import('../use-session-room.js').useSessionRoom>, onHome: () => void}} props */
export function ConnectionRoom({ live, onHome }) {
  const [confirmLeave, setConfirmLeave] = useState(false);
  const media = live.media;
  const connected = media?.room.state === ConnectionState.Connected;
  const description = !live.session
    ? live.error
      ? 'Không truy cập được phiên'
      : 'Đang tải trạng thái phiên'
    : live.session.status === 'ended'
      ? 'Phiên đã kết thúc'
      : 'Mic và camera là tùy chọn';
  return (
    <section className="ck-connection-screen" data-screen-id="SC-07">
      <Dialog
        open={!confirmLeave}
        friendly
        title="Sẵn sàng vào phòng?"
        description={description}
        onClose={() => (live.accessDenied ? onHome() : setConfirmLeave(true))}
        closeLabel="Hủy kết nối phòng"
        headingAdornment={
          <div className="ck-ready-icon">
            <Icon name="mic" size={27} />
            <Icon name="camera" size={27} />
          </div>
        }
        footer={
          <>
            {!connected && !live.accessDenied && (
              <Button
                variant="primary"
                fullWidth
                disabled={
                  !live.session ||
                  live.connecting ||
                  live.leaving ||
                  live.session.status === 'ended'
                }
                onClick={() => {
                  void live.connect();
                }}
              >
                {live.connecting
                  ? 'Đang kết nối…'
                  : live.mediaError
                    ? 'Thử lại kết nối'
                    : 'Tiếp tục không mic/camera'}
              </Button>
            )}
            {live.error && !live.accessDenied && (
              <Button fullWidth onClick={live.refresh}>
                Thử tải lại trạng thái
              </Button>
            )}
            {live.accessDenied ? (
              <Button variant="ghost" fullWidth onClick={onHome}>
                Về trang chủ
              </Button>
            ) : (
              <Button
                variant="ghost"
                fullWidth
                disabled={live.leaving}
                onClick={() => setConfirmLeave(true)}
              >
                Hủy và rời phiên
              </Button>
            )}
          </>
        }
      >
        <div className="ck-connection-status" aria-live="polite">
          <p>
            Bạn:{' '}
            {live.connecting
              ? 'Đang kết nối…'
              : connected
                ? 'Đã kết nối media'
                : 'Chưa kết nối media'}
          </p>
          <p>
            Bạn luyện:{' '}
            {media?.room.remoteParticipants.size
              ? 'Đã kết nối media'
              : 'Đang chờ kết nối'}
          </p>
          {connected && (
            <p>Chờ máy chủ xác nhận đủ hai người trước khi bắt đầu.</p>
          )}
        </div>
        {
          /** @type {['microphone'|'camera', string, string][]} */ ([
            ['microphone', 'Micrô', 'mic'],
            ['camera', 'Máy ảnh', 'camera'],
          ]).map(([device, label, icon]) => {
            const enabled =
              device === 'camera'
                ? !!media?.room.localParticipant.isCameraEnabled
                : !!media?.room.localParticipant.isMicrophoneEnabled;
            return (
              <div className="ck-device-row" key={device}>
                <span className="ck-device-icon">
                  <Icon name={icon} />
                </span>
                <div>
                  <label htmlFor={`ck-device-${device}`}>{label}</label>
                  <small id={`ck-device-${device}-status`}>
                    {media?.pendingDevices.has(device)
                      ? 'Đang kiểm tra thiết bị…'
                      : enabled
                        ? 'Đang bật'
                        : 'Đang tắt'}
                  </small>
                </div>
                <input
                  id={`ck-device-${device}`}
                  className="ck-device-switch"
                  role="switch"
                  type="checkbox"
                  checked={enabled}
                  aria-describedby={`ck-device-${device}-status`}
                  disabled={!connected || media?.pendingDevices.has(device)}
                  onChange={() => {
                    void media?.setDevice(device, !enabled);
                  }}
                />
              </div>
            );
          })
        }
        {[live.error, live.mediaError, ...(media?.deviceErrors.values() ?? [])]
          .filter(Boolean)
          .map((message, index) => (
            <p role="alert" className="ck-error" key={index}>
              {message}
            </p>
          ))}
      </Dialog>
      {confirmLeave && (
        <LeaveDialog
          onCancel={() => setConfirmLeave(false)}
          onConfirm={() => {
            void live.leave();
          }}
          pending={live.leaving}
          partnerName="bạn luyện"
        />
      )}
    </section>
  );
}
