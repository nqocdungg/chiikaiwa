import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { Button } from '../../client/src/components/ui/controls.jsx';
import { Dialog } from '../../client/src/components/ui/Dialog.jsx';
import { Input, PasswordInput } from '../../client/src/components/ui/forms.jsx';
import { Avatar } from '../../client/src/components/ui/surfaces.jsx';

afterEach(() => {
  cleanup();
  globalThis.document.body.style.overflow = '';
});

describe('frontend foundation', () => {
  it('blocks repeated button actions while loading', () => {
    const onClick = vi.fn();
    render(
      <Button variant="primary" loading onClick={onClick}>
        Đang tìm bạn
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Đang tìm bạn' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('connects an input error to its control', () => {
    render(
      <Input id="display-name" label="Tên hiển thị" error="Tên không hợp lệ" />,
    );

    const input = screen.getByLabelText('Tên hiển thị');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'display-name-error');
    expect(screen.getByText('Tên không hợp lệ')).toHaveAttribute(
      'id',
      'display-name-error',
    );
  });

  it('toggles password visibility without submitting', () => {
    render(
      <form>
        <PasswordInput label="Mật khẩu" defaultValue="secret" />
      </form>,
    );

    const input = screen.getByLabelText('Mật khẩu');
    expect(input).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Hiện mật khẩu' }));
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Ẩn mật khẩu' })).toHaveAttribute(
      'type',
      'button',
    );
  });

  it('closes a dialog with Escape and restores focus', () => {
    function Example() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Mở xác nhận
          </button>
          <Dialog open={open} onClose={() => setOpen(false)} title="Xác nhận">
            <p>Nội dung</p>
          </Dialog>
        </>
      );
    }

    render(<Example />);
    const trigger = screen.getByRole('button', { name: 'Mở xác nhận' });
    trigger.focus();
    fireEvent.click(trigger);
    expect(globalThis.document.body).toHaveStyle({ overflow: 'hidden' });
    const dialog = screen.getByRole('dialog');
    expect(
      screen.getByRole('button', { name: 'Đóng hộp thoại' }),
    ).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('falls back to initials when an avatar image is missing', () => {
    render(
      <Avatar
        name="Nguyễn Minh Anh"
        alt="Ảnh đại diện của Minh Anh"
        src="/missing.webp"
      />,
    );
    const image = screen
      .getByRole('img', { name: 'Ảnh đại diện của Minh Anh' })
      .querySelector('img');
    if (!(image instanceof globalThis.HTMLImageElement))
      throw new Error('Missing avatar image');
    fireEvent.error(image);
    expect(screen.getByText('MA')).toBeVisible();
  });
});
