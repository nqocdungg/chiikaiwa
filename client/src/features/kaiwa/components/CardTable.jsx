import { Icon } from '../../../components/ui/controls.jsx';

/** @param {{count: number, used: number[], disabled: boolean, onDraw: (index: number) => void}} props */
export function CardTable({ count, used, disabled, onDraw }) {
  return (
    <div className="ck-draw">
      <h2>Chọn một câu chuyện.</h2>
      <p>Một buổi hẹn cà phê</p>
      <div className="ck-card-table">
        {Array.from({ length: count }).map(
          (_, index) =>
            !used.includes(index) && (
              <button
                type="button"
                key={index}
                aria-label={`Bốc lá ${index + 1}`}
                disabled={disabled}
                onClick={() => onDraw(index)}
              >
                <span lang="ja">ち</span>
                <Icon name="cards" size={27} />
              </button>
            ),
        )}
      </div>
      <p className="ck-muted">
        Nội dung mở sau khi bốc. Vai của mỗi người được giữ riêng.
      </p>
    </div>
  );
}
