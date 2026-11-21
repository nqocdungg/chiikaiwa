import { useState } from 'react';
import { AuthLayout } from '../components/layout/AuthLayout.jsx';
import { PageContainer } from '../components/layout/PageContainer.jsx';
import { Button, Icon, IconButton } from '../components/ui/controls.jsx';
import { Dialog } from '../components/ui/Dialog.jsx';
import { Input, PasswordInput } from '../components/ui/forms.jsx';
import { Avatar, Badge, Card } from '../components/ui/surfaces.jsx';
import { usagi } from '../assets/mascots/mascots.js';
import '../styles/component-preview.css';

const longName = 'Nguyễn Hoàng Minh Anh với một cái tên rất dài';

export function ComponentPreview() {
  const [modalOpen, setModalOpen] = useState(
    () =>
      new globalThis.URLSearchParams(globalThis.location.search).get(
        'modal',
      ) === '1',
  );
  const [selectedCard, setSelectedCard] = useState(false);

  return (
    <main className="ck-preview">
      <PageContainer>
        <header className="ck-preview__hero">
          <Badge tone="accent">Development only</Badge>
          <h1>Nền giao diện Chiikaiwa</h1>
          <p>
            Kiểm tra token, trạng thái component, nội dung Việt/Nhật và các biên
            responsive trước khi dựng màn nghiệp vụ.
          </p>
        </header>

        <PreviewSection title="Button và IconButton">
          <div className="ck-preview__row">
            <Button variant="primary" leadingIcon={<Icon name="search" />}>
              Bắt đầu tìm
            </Button>
            <Button variant="secondary">Hủy tìm</Button>
            <Button variant="ghost">Để sau</Button>
            <Button variant="danger">Xóa bộ thẻ</Button>
            <Button variant="primary" loading>
              Đang tìm bạn luyện nói
            </Button>
            <Button disabled>Nút đang bị vô hiệu hóa</Button>
          </div>
          <div className="ck-preview__row">
            <IconButton name="star" label="Lưu kiến thức" />
            <IconButton name="star" label="Bỏ lưu kiến thức" pressed />
            <IconButton name="close" label="Đóng" disabled />
            <Button variant="primary" fullWidth>
              Nhãn rất dài vẫn xuống dòng an toàn trên màn hình nhỏ
            </Button>
          </div>
        </PreviewSection>

        <PreviewSection title="Form controls">
          <div className="ck-preview__grid ck-preview__grid--forms">
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              defaultValue="minhanh.nguyen.with.a.very.long.address@example.com"
              helperText="Dùng email bạn đã đăng ký."
            />
            <PasswordInput
              label="Mật khẩu"
              autoComplete="current-password"
              defaultValue="chiikaiwa"
              helperText="Nút hiện mật khẩu không gửi form."
            />
            <Input
              label="Tên hiển thị"
              defaultValue={longName}
              error="Tên hiển thị tối đa 50 ký tự và không được chỉ gồm khoảng trắng."
            />
            <Input
              label="Trường không khả dụng"
              value="Dữ liệu do hệ thống quản lý"
              disabled
              readOnly
            />
          </div>
        </PreviewSection>

        <PreviewSection title="Card, Avatar và Badge">
          <div className="ck-preview__grid ck-preview__grid--cards">
            <Card>
              <div className="ck-preview__profile">
                <Avatar
                  name={longName}
                  size={48}
                  src="/__missing-avatar.webp"
                />
                <div>
                  <strong>{longName}</strong>
                  <span>Ảnh lỗi chuyển về initials</span>
                </div>
              </div>
              <div className="ck-preview__row">
                <Badge>N4</Badge>
                <Badge tone="success">Đã kết nối</Badge>
                <Badge tone="warning">Còn 2 phút</Badge>
                <Badge tone="danger">Mất kết nối</Badge>
              </div>
            </Card>
            <Card
              interactive
              selected={selectedCard}
              onClick={() => setSelectedCard((current) => !current)}
            >
              <Badge tone="accent">会話セット</Badge>
              <h3 lang="ja">カフェで注文する</h3>
              <p>
                Gọi món ở quán cà phê với một mô tả dài để kiểm tra co giãn.
              </p>
              <strong>{selectedCard ? 'Đã chọn' : 'Chọn bộ này'}</strong>
            </Card>
          </div>
        </PreviewSection>

        <PreviewSection title="Modal / Dialog">
          <p>
            Mẫu dùng native dialog: focus được giữ trong hộp thoại, Escape đóng,
            body cuộn độc lập và focus trở về nút mở.
          </p>
          <Button variant="primary" onClick={() => setModalOpen(true)}>
            Mở modal dài
          </Button>
          <Dialog
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            title="Xác nhận nội dung luyện tập"
            description="Kiểm tra tiêu đề dài, body cuộn và footer luôn tiếp cận được."
            size="form"
            friendly
            footer={
              <>
                <Button variant="secondary" onClick={() => setModalOpen(false)}>
                  Quay lại
                </Button>
                <Button variant="primary" onClick={() => setModalOpen(false)}>
                  Xác nhận
                </Button>
              </>
            }
          >
            <div className="ck-preview__dialog-content">
              {Array.from({ length: 9 }, (_, index) => (
                <Card key={index}>
                  <Badge tone="accent">Tình huống {index + 1}</Badge>
                  <h3 lang="ja">今日はどんな話をしましょうか。</h3>
                  <p>
                    Nội dung mô phỏng để xác nhận vùng thân hộp thoại cuộn khi
                    chiều cao viewport bị giới hạn.
                  </p>
                </Card>
              ))}
            </div>
          </Dialog>
        </PreviewSection>

        <PreviewSection title="AuthLayout">
          <div className="ck-preview__auth-frame">
            <AuthLayout mascot={usagi} mascotAlt="Mascot thỏ Chiikaiwa">
              <div className="ck-preview__auth-copy">
                <Badge tone="accent">おかえりなさい</Badge>
                <h2>Chào mừng bạn trở lại</h2>
                <p>Layout hai cột chuyển thành một cột dưới 768px.</p>
                <Input label="Email" placeholder="ban@example.com" />
                <Button variant="primary" fullWidth>
                  Đăng nhập
                </Button>
              </div>
            </AuthLayout>
          </div>
        </PreviewSection>
      </PageContainer>
    </main>
  );
}

/** @param {{title: string, children: import('react').ReactNode}} props */
function PreviewSection({ title, children }) {
  return (
    <section className="ck-preview__section">
      <h2>{title}</h2>
      <div className="ck-preview__section-content">{children}</div>
    </section>
  );
}
