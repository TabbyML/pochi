'use client';

import React from 'react';

const CustomImage = (props: React.ComponentProps<"img">) => {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
  const src = basePath && typeof props.src === 'string' && props.src.startsWith('/')
    ? `${basePath}${props.src}`
    : props.src;

  return <img {...props} src={src} />;
};

export default CustomImage;