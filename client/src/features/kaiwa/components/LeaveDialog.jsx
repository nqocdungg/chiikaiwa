import { Button } from '../../../components/ui/controls.jsx';
import { Dialog } from '../../../components/ui/Dialog.jsx';

/** @param {{onCancel: () => void, onConfirm: () => void}} props */
export function LeaveDialog({ onCancel, onConfirm }) {
  return (
    <Dialog
      open
      onClose={onCancel}
      title="Rời phòng cho cả hai?"
      description="Phiên luyện của bạn và Haru sẽ kết thúc."
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            Ở lại phòng
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            Rời và xem tổng kết
          </Button>
        </>
      }
    >
      <p>Hành động này không thể hoàn tác sau khi đã xác nhận.</p>
    </Dialog>
  );
}
