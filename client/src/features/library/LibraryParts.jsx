import chiikawaPeek from '../../assets/mascots/chiikawa-peek.webp';
import usagiFace from '../../assets/mascots/usagi-face.webp';
import { Button } from '../../components/ui/controls.jsx';
import { Badge, Card } from '../../components/ui/surfaces.jsx';
import searchIcon from './assets/search.svg';
import { libraryError } from './library-hooks.js';

export function SavedIntro() {
  return (
    <div className="ck-library-intro">
      <div className="ck-library-intro__copy">
        <h1>Ôn cá nhân</h1>
        <p>Mở sổ tay để ôn lại từ vựng và mẫu câu đã lưu.</p>
      </div>
      <div className="ck-library-intro__art">
        <span className="ck-library-intro__stamp" lang="ja">
          復習
        </span>
        <div className="ck-library-intro__mascots" aria-hidden="true">
          <img className="ck-library-intro__friend" src={chiikawaPeek} alt="" />
          <img className="ck-library-intro__mascot" src={usagiFace} alt="" />
          <span className="ck-library-intro__sparkle">✦</span>
        </div>
      </div>
    </div>
  );
}

/** @param {{ id: string, name: string, label: string, placeholder: string, defaultValue: string }} props */
export function LibrarySearch({ id, name, label, placeholder, defaultValue }) {
  return (
    <label className="ck-library-field" htmlFor={id}>
      {label}
      <span className="ck-library-search">
        <img src={searchIcon} alt="" width="18" height="18" />
        <input
          id={id}
          name={name}
          type="search"
          defaultValue={defaultValue}
          placeholder={placeholder}
        />
      </span>
    </label>
  );
}

/** @param {{item: import('./library-api.js').Knowledge, children?: import('react').ReactNode, examples?: boolean}} props */
export function LibraryKnowledge({ item, children, examples = false }) {
  return (
    <Card className="ck-library-knowledge">
      <div className="ck-library-knowledge__copy">
        <Badge tone="accent">
          {item.type === 'grammar' ? 'Mẫu câu' : 'Từ vựng'}
        </Badge>
        <h3 lang="ja">{item.expression}</h3>
        {item.reading && (
          <p className="ck-library-reading" lang="ja">
            {item.reading}
          </p>
        )}
        <p>{item.meaning}</p>
      </div>
      {examples && item.examples.length > 0 && (
        <div className="ck-library-examples">
          <h4>Ví dụ</h4>
          <ul>
            {item.examples.map((example, index) => (
              <li key={index}>
                <span lang="ja">{example.japanese}</span>
                <span>{example.vietnamese}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {children}
    </Card>
  );
}

/** @param {{ pending: boolean, empty: boolean, error: unknown, retry: () => void, emptyText: string, children?: import('react').ReactNode }} props */
export function LibraryStatus({
  pending,
  empty,
  error,
  retry,
  emptyText,
  children,
}) {
  if (error && empty) {
    return (
      <div className="ck-library-state">
        <p role="alert">{libraryError(error, 'Không tải được nội dung.')}</p>
        <Button variant="secondary" size="compact" onClick={retry}>
          Thử lại
        </Button>
      </div>
    );
  }
  if (pending && empty)
    return (
      <div className="ck-library-state" role="status">
        Đang tải…
      </div>
    );
  if (!empty) return children;
  return <div className="ck-library-state">{emptyText}</div>;
}

/** @param {{ pending: boolean, hasMore: boolean, error: unknown, more: () => void }} props */
export function LibraryMore({ pending, hasMore, error, more }) {
  if (!hasMore) return null;
  return (
    <div className="ck-library-more">
      {error ? (
        <p role="alert">
          {libraryError(error, 'Không tải được trang tiếp theo.')}
        </p>
      ) : null}
      <Button variant="secondary" loading={pending} onClick={more}>
        {error ? 'Thử tải lại' : 'Xem thêm'}
      </Button>
    </div>
  );
}
