/** @param {{children: import('react').ReactNode, as?: 'div'|'main'|'section', className?: string}} props */
export function PageContainer({
  children,
  as: Element = 'div',
  className = '',
}) {
  return (
    <Element className={`ck-page-container ${className}`.trim()}>
      {children}
    </Element>
  );
}
