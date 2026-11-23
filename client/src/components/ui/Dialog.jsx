import { useEffect, useId, useRef } from 'react';
import chiikawaPeek from '../../assets/mascots/chiikawa-peek.webp';
import { IconButton } from './controls.jsx';

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * @param {{
 * open: boolean,
 * onClose: () => void,
 * title: string,
 * headingAdornment?: import('react').ReactNode,
 * eyebrow?: string,
 * description?: string,
 * children: import('react').ReactNode,
 * footer?: import('react').ReactNode,
 * size?: 'compact'|'form',
 * friendly?: boolean,
 * appearance?: 'default'|'sticker',
 * align?: 'start'|'center',
 * className?: string,
 * footerClassName?: string,
 * closeLabel?: string,
 * closeDisabled?: boolean,
 * closeOnBackdrop?: boolean,
 * initialFocusRef?: import('react').RefObject<HTMLElement|null>,
 * }} props
 */
export function Dialog({
  open,
  onClose,
  title,
  headingAdornment,
  eyebrow,
  description,
  children,
  footer,
  size = 'compact',
  friendly = false,
  appearance = 'default',
  align = 'start',
  className = '',
  footerClassName = '',
  closeLabel = 'Đóng hộp thoại',
  closeDisabled = false,
  closeOnBackdrop = true,
  initialFocusRef,
}) {
  const dialogRef = useRef(/** @type {HTMLDialogElement|null} */ (null));
  const closeRef = useRef(/** @type {HTMLButtonElement|null} */ (null));
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return undefined;

    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }

    const focusTarget = initialFocusRef?.current ?? closeRef.current ?? dialog;
    focusTarget.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      if (dialog.open && typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus();
      }
    };
  }, [initialFocusRef, open]);

  if (!open) return null;

  const classes = [
    'ck-dialog',
    size === 'form' ? 'ck-dialog--form' : '',
    friendly ? 'ck-dialog--friendly' : '',
    appearance === 'sticker' ? 'ck-dialog--sticker' : '',
    align === 'center' ? 'ck-dialog--centered' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  /** @param {import('react').KeyboardEvent<HTMLDialogElement>} event */
  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (!closeDisabled) onClose();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = [
      ...event.currentTarget.querySelectorAll(focusableSelector),
    ].filter(
      (element) =>
        element instanceof HTMLElement && element.offsetParent !== null,
    );
    if (focusable.length === 0) {
      event.preventDefault();
      event.currentTarget.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      if (last instanceof HTMLElement) last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      if (first instanceof HTMLElement) first.focus();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className={classes}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        if (!closeDisabled) onClose();
      }}
      onClick={(event) => {
        if (
          closeOnBackdrop &&
          !closeDisabled &&
          event.target === event.currentTarget
        )
          onClose();
      }}
      onKeyDown={handleKeyDown}
    >
      {appearance === 'sticker' ? (
        <img
          className="ck-dialog__sticker-top"
          src={chiikawaPeek}
          alt=""
          width="82"
          height="82"
        />
      ) : null}
      <div className="ck-dialog__layout">
        <header className="ck-dialog__header">
          <div className="ck-dialog__heading">
            {headingAdornment ? (
              <div className="ck-dialog__heading-adornment">
                {headingAdornment}
              </div>
            ) : null}
            {eyebrow ? <p className="ck-dialog__eyebrow">{eyebrow}</p> : null}
            <h2 id={titleId} className="ck-dialog__title">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="ck-dialog__description">
                {description}
              </p>
            ) : null}
          </div>
          <IconButton
            buttonRef={closeRef}
            className="ck-dialog__close"
            name="close"
            label={closeLabel}
            onClick={onClose}
            disabled={closeDisabled}
          />
        </header>
        <div className="ck-dialog__body">{children}</div>
        {footer ? (
          <footer className={`ck-dialog__footer ${footerClassName}`.trim()}>
            {footer}
          </footer>
        ) : null}
      </div>
    </dialog>
  );
}

export const Modal = Dialog;
