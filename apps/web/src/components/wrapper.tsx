type WrapperProps = React.ComponentProps<'div'> & {
  maxWidth?: number | string
  padding?: number | string
}

export function Wrapper({
  className,
  maxWidth,
  padding,
  ...props
}: WrapperProps) {
  return (
    <div
      className={`mx-auto w-full max-w-[min(var(--max-width,80rem),calc(100%-(var(--padding,4%)*2)))] ${typeof className === 'string' ? className : ''}`}
      style={{
        // @ts-expect-error Ignore
        '--max-width': maxWidth ? `${maxWidth}px` : undefined,
        '--padding': padding ? `${padding}px` : undefined,
        ...(typeof props.style === 'object' ? props.style : {}),
      }}
      {...props}
    />
  )
}
