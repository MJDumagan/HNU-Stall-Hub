'use client';

import { useState } from 'react';

export default function ProductImage({ src, alt = '', className = '' }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span className={`product-image-unavailable ${className}`.trim()} role="img" aria-label="Product image could not load">
        Image unavailable
      </span>
    );
  }

  return <img className={className} src={src} alt={alt} onError={() => setFailed(true)} />;
}
