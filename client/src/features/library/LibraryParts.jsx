import { Button } from '../../components/ui/controls.jsx';
import { Badge, Card } from '../../components/ui/surfaces.jsx';
import searchIcon from '../../assets/library/search.svg';
import { libraryError } from './library-hooks.js';

/** @param {{saved?: boolean}} props */
export function LibraryIntro({ saved = false }) {
  return (
    <div className="ck-library-intro">
      <p lang="ja">{saved ? '復習' : '会話ライブラリ'}</p>
      <h1>{saved ? 'Ôn cá nhân' : 'Kho chủ đề'}</h1>
      <p>
        {saved
          ? 'Ôn lại từ vựng và mẫu câu đã lưu. Bỏ lưu vẫn giữ tiến độ ôn tập.'
          : 'Khám phá bộ hội thoại và học từ vựng, mẫu câu theo chủ đề.'}
      </p>
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
      <Badge tone="accent">
        {item.type === 'grammar' ? 'Mẫu câu' : 'Từ vựng'}
      </Badge>
      <h2 lang="ja">{item.expression}</h2>
      {item.reading && (
        <p className="ck-library-reading" lang="ja">
          {item.reading}
        </p>
      )}
      <p>{item.meaning}</p>
      {examples && item.examples.length > 0 && (
        <div className="ck-library-examples">
          <h3>Ví dụ</h3>
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
