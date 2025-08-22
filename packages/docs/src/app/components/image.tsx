'use client';

import NextImage, { type ImageProps } from 'next/image';

const CustomImage = (props: ImageProps) => {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
  const src = basePath && typeof props.src === 'string' && props.src.startsWith('/')
    ? `${basePath}${props.src}`
    : props.src;

  return <NextImage {...props} src={src} unoptimized />;
};

export default CustomImage;

