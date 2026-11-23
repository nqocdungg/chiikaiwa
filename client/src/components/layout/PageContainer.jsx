/** @param {{children: import('react').ReactNode, as?: 'div'|'main'|'section', className?: string, id?: string}} props */
export function PageContainer({
  children,
  as: Element = 'div',
  className = '',
  id,
}) {
  return (
    <Element id={id} className={`ck-page-container ${className}`.trim()}>
      {children}
    </Element>
  );
}
