import { Button } from '../../../components/ui/controls.jsx';
import { Dialog } from '../../../components/ui/Dialog.jsx';

/** @param {{onCancel: () => void, onConfirm: () => void, pending?: boolean, partnerName?: string}} props */
export function LeaveDialog({
  onCancel,
  onConfirm,
  pending = false,
  partnerName = 'Haru',
}) {
  return (
    <Dialog
      open
      appearance="sticker"
      align="center"
      onClose={onCancel}
      title="Rời phòng cho cả hai?"
      description={`Phiên luyện của bạn và ${partnerName} sẽ kết thúc.`}
      footer={
        <>
          <Button appearance="sticker" variant="secondary" onClick={onCancel}>
            Ở lại phòng
          </Button>
          <Button
            appearance="sticker"
            variant="danger"
            onClick={onConfirm}
            loading={pending}
          >
            {pending ? 'Đang rời phòng…' : 'Rời và xem tổng kết'}
          </Button>
        </>
      }
    >
      <p>Hành động này không thể hoàn tác sau khi đã xác nhận.</p>
    </Dialog>
  );
}
