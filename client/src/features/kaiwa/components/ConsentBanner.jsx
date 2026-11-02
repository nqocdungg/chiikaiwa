import { Button } from '../../../components/ui/controls.jsx';
const actionNames = {
  swap: 'Đổi vai',
  skip: 'Bỏ qua tình huống',
  complete: 'Hoàn thành và tiếp tục',
};

/** @param {{consent: {action: 'swap'|'skip'|'complete', incoming: boolean}, scenarioTitle: string, onRespond: (accepted: boolean) => void, onCancel: () => void}} props */
export function ConsentBanner({ consent, scenarioTitle, onRespond, onCancel }) {
  return (
    <div className="ck-consent" role="status">
      <div>
        <strong>
          {consent.incoming ? 'Haru đề nghị' : 'Bạn đề nghị'}:{' '}
          {actionNames[consent.action]}
        </strong>
        <p>
          {scenarioTitle} ·{' '}
          {consent.incoming ? 'Chờ phản hồi của bạn.' : 'Đang chờ Haru đồng ý.'}
        </p>
      </div>
      {consent.incoming ? (
        <div className="ck-actions">
          <Button onClick={() => onRespond(false)}>Từ chối</Button>
          <Button variant="primary" onClick={() => onRespond(true)}>
            Đồng ý
          </Button>
        </div>
      ) : (
        <button className="ck-text-button" onClick={onCancel}>
          Hủy
        </button>
      )}
    </div>
  );
}
