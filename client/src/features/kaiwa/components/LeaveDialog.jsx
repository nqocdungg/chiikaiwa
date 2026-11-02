import { useEffect, useRef } from 'react';
import { Button } from '../../../components/ui/controls.jsx';

/** @param {{onCancel: () => void, onConfirm: () => void}} props */
export function LeaveDialog({ onCancel, onConfirm }) {
  const ref = useRef(/** @type {HTMLDialogElement|null} */ (null));
  const cancel = useRef(/** @type {HTMLButtonElement|null} */ (null));
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog?.showModal();
    cancel.current?.focus();
    return () => {
      dialog?.close();
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="ck-dialog"
      aria-labelledby="ck-leave-title"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2 id="ck-leave-title">Rời phòng cho cả hai?</h2>
      <p>Phiên luyện của bạn và Haru sẽ kết thúc.</p>
      <div className="ck-actions">
        <button
          ref={cancel}
          type="button"
          className="ck-button"
          onClick={onCancel}
        >
          Ở lại phòng
        </button>
        <Button variant="danger" onClick={onConfirm}>
          Rời và xem tổng kết
        </Button>
      </div>
    </dialog>
  );
}
