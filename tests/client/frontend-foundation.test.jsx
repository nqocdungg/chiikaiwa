import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { readFileSync } from 'node:fs';
import { Button } from '../../client/src/components/ui/controls.jsx';
import { Dialog } from '../../client/src/components/ui/Dialog.jsx';
import {
  Input,
  PasswordInput,
  Select,
} from '../../client/src/components/ui/forms.jsx';
import { Avatar } from '../../client/src/components/ui/surfaces.jsx';

afterEach(() => {
  cleanup();
  globalThis.document.body.style.overflow = '';
});

describe('frontend foundation', () => {
  it.each(['default', 'sticker'])(
    'blocks repeated button actions while loading (%s)',
    (appearance) => {
      const onClick = vi.fn();
      const foundationStyles = readFileSync(
        'client/src/styles/foundation.css',
        'utf8',
      );
      render(
        <>
          <style>
            {
              foundationStyles.match(
                /\.ck-button__content--loading\s*\{[^}]+\}/,
              )?.[0]
            }
          </style>
          <Button
            variant="primary"
            appearance={/** @type {'default'|'sticker'} */ (appearance)}
            loading
            onClick={onClick}
          >
            Đang tìm bạn
          </Button>
        </>,
      );

      expect(
        globalThis.getComputedStyle(screen.getByText('Đang tìm bạn'))
          .visibility,
      ).toBe('visible');
      const button = screen.getByRole('button', { name: 'Đang tìm bạn' });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('aria-busy', 'true');
      expect(button.classList.contains('ck-button--sticker')).toBe(
        appearance === 'sticker',
      );
      fireEvent.click(button);
      expect(onClick).not.toHaveBeenCalled();
    },
  );

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

  it('connects select help and errors to the native control', () => {
    const { rerender } = render(
      <Select label="Trình độ" helperText="Chọn trình độ của bạn">
        <option value="N5">N5</option>
      </Select>,
    );

    const select = screen.getByRole('combobox', { name: 'Trình độ' });
    expect(select).toHaveValue('N5');
    expect(select).toHaveAccessibleDescription('Chọn trình độ của bạn');
    expect(select).not.toHaveAttribute('aria-invalid');

    rerender(
      <Select
        label="Trình độ"
        helperText="Chọn trình độ của bạn"
        error="Trình độ không hợp lệ"
      >
        <option value="N5">N5</option>
      </Select>,
    );

    expect(select).toHaveAccessibleDescription('Trình độ không hợp lệ');
    expect(select).toHaveAttribute('aria-invalid', 'true');
  });

  it('toggles password visibility without submitting', () => {
    render(
      <form>
        <PasswordInput label="Mật khẩu" defaultValue="secret" />
      </form>,
    );

    const input = screen.getByLabelText('Mật khẩu');
    expect(input).toHaveAttribute('type', 'password');
    const toggle = screen.getByRole('button', { name: 'Hiện mật khẩu' });
    expect(toggle).toHaveAttribute('type', 'button');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    expect(input).toHaveAttribute('type', 'text');
    expect(toggle).toHaveAccessibleName('Hiện mật khẩu');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(toggle).toHaveAttribute('title', 'Ẩn mật khẩu');
  });

  it.each(['default', 'sticker'])(
    'closes a dialog with Escape and restores focus (%s)',
    (appearance) => {
      function Example() {
        const [open, setOpen] = useState(false);
        return (
          <>
            <button type="button" onClick={() => setOpen(true)}>
              Mở xác nhận
            </button>
            <Dialog
              open={open}
              appearance={/** @type {'default'|'sticker'} */ (appearance)}
              onClose={() => setOpen(false)}
              title="Xác nhận"
            >
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
      expect(dialog.classList.contains('ck-dialog--sticker')).toBe(
        appearance === 'sticker',
      );
      expect(
        screen.getByRole('button', { name: 'Đóng hộp thoại' }),
      ).toHaveFocus();
      fireEvent.keyDown(dialog, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    },
  );

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
