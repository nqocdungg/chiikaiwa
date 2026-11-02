import { useState } from 'react';
import { Button, Icon } from '../../components/ui/controls.jsx';
import { Friends } from '../../components/Friends.jsx';

/** @param {{onStart: () => void}} props */
export function Home({ onStart }) {
  const [preview, setPreview] = useState('');
  return (
    <>
      <header className="ck-home-header">
        <a
          className="ck-brand"
          href="#ck-home"
          aria-label="Chiikaiwa, trang chính"
        >
          <span lang="ja">ち</span>chiikaiwa
        </a>
        <nav aria-label="Điều hướng chính">
          <a href="#ck-home" aria-current="page">
            Trang chính
          </a>
          <button onClick={onStart}>Luyện hội thoại</button>
        </nav>
        <div className="ck-profile">
          <span className="ck-avatar">M</span>
          <span>
            Minh Anh<small>N4</small>
          </span>
        </div>
      </header>
      <main id="ck-home" className="ck-home">
        <div className="ck-home-layout">
          <section className="ck-welcome">
            <h1>
              Một câu chào,
              <br />
              một câu chuyện mới.
            </h1>
            <p>Luyện hội thoại tiếng Nhật cùng một người bạn.</p>
            <div className="ck-actions">
              <Button variant="primary" onClick={onStart}>
                Tìm bạn luyện <Icon name="arrow" />
              </Button>
              <Button onClick={() => setPreview('Mã mời')}>Dùng mã mời</Button>
            </div>
            <span className="ck-device-note">
              <Icon name="camera" size={16} />
              Mic và camera là tùy chọn.
            </span>
          </section>
          <section className="ck-study">
            <Friends />
            <h2>Góc học của bạn</h2>
            {[
              { name: 'Học theo chủ đề', icon: 'book' },
              { name: 'Ôn cá nhân', icon: 'cards' },
              { name: 'Lịch sử luyện tập', icon: 'clock' },
            ].map((item) => (
              <button
                className="ck-study-link"
                key={item.name}
                onClick={() => setPreview(item.name)}
              >
                <Icon name={item.icon} />
                <span>{item.name}</span>
                <Icon name="arrow" size={18} />
              </button>
            ))}
          </section>
        </div>
        {preview && (
          <section className="ck-home-preview" role="status">
            <div>
              <h2>{preview}</h2>
              <p>
                {preview === 'Mã mời'
                  ? 'Tạo hoặc nhập mã có hiệu lực 10 phút. Luồng mã mời chưa kết nối trong bản demo.'
                  : preview === 'Học theo chủ đề'
                    ? 'Học từ vựng, cấu trúc, flashcard và quiz theo chủ đề. Luồng học liệu chưa kết nối trong bản demo.'
                    : preview === 'Ôn cá nhân'
                      ? 'Chưa có kiến thức đã lưu trong dữ liệu mẫu. Luồng ôn tập chưa kết nối.'
                      : 'Chưa có phiên trước đây trong dữ liệu mẫu.'}
              </p>
            </div>
            <button
              className="ck-icon-button"
              aria-label="Đóng nội dung minh họa"
              onClick={() => setPreview('')}
            >
              <Icon name="close" />
            </button>
          </section>
        )}
        <footer className="ck-home-footer">
          <span>ちいさな会話 · chiikaiwa</span>
          <span>Bản demo · Dữ liệu mẫu</span>
        </footer>
      </main>
    </>
  );
}
