// Lucian UX/UI Prompt #043 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#043
import './island-pagination.css';

/**
 * @param {{page: number, count: number, direction: number, disabled: boolean, onChange: (page: number) => void}} props
 */
export function IslandPagination({
  page,
  count,
  direction,
  disabled,
  onChange,
}) {
  const visibleCount = Math.min(count, 5);
  const firstVisible = Math.max(0, Math.min(page - 2, count - visibleCount));
  const visiblePage = page - firstVisible;

  return (
    <nav
      className={`ck-island-pagination ${direction < 0 ? 'go-l' : 'go-r'}`}
      aria-label="Các nhóm chủ đề"
      onKeyDown={(event) => {
        const delta =
          event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        if (!delta || disabled) return;
        const target = page + delta;
        if (target < 0 || target >= count) return;
        event.preventDefault();
        event.currentTarget
          .querySelectorAll('button')
          [target - firstVisible]?.focus();
        onChange(target);
      }}
    >
      <span
        className="ck-island-pagination__indicator"
        aria-hidden="true"
        style={{
          left: `${visiblePage * 2.125 + 0.5}rem`,
          right: `${(visibleCount - visiblePage - 1) * 2.125 + 0.5}rem`,
        }}
      />
      {Array.from(
        { length: visibleCount },
        (_, offset) => firstVisible + offset,
      ).map((index) => (
        <button
          type="button"
          key={index}
          aria-label={`Nhóm chủ đề ${index + 1}`}
          aria-current={page === index ? 'page' : undefined}
          onClick={() => onChange(index)}
          disabled={disabled}
        />
      ))}
    </nav>
  );
}
