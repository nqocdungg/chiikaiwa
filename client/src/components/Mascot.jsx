/**
 * @param {Omit<import('react').ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
 *   asset: { src: string, stillSrc: string },
 * }} props
 */
export function Mascot({ asset, alt = '', ...imageProps }) {
  return (
    <picture className="ck-mascot-picture">
      <source
        media="(prefers-reduced-motion: reduce)"
        srcSet={asset.stillSrc}
      />
      <img {...imageProps} src={asset.src} alt={alt} />
    </picture>
  );
}
