import React, { useEffect, useState } from 'react';
import { blobUrl, isDemo } from './api';

/** Immagine prodotto: link https diretti, file caricati serviti dall'API (o blob nella demo). */
export function Img({ src, ...rest }: React.ImgHTMLAttributes<HTMLImageElement> & { src: string }) {
  const needsBlob = isDemo() && src.startsWith('/api/');
  const [url, setUrl] = useState(needsBlob ? '' : src);
  useEffect(() => {
    if (!needsBlob) { setUrl(src); return; }
    let alive = true;
    blobUrl(src).then(u => alive && setUrl(u)).catch(() => {});
    return () => { alive = false; };
  }, [src, needsBlob]);
  return url ? <img src={url} {...rest} /> : <img {...rest} />;
}
