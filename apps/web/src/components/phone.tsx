import { clsx } from 'clsx'
import Image from 'next/image'

export function Phone(props: { className?: string }) {
  return (
    <div
      className={clsx(
        'rounded-[2.4rem] bg-[#0b0c0e] p-[5px] shadow-[0_40px_80px_-24px_rgb(0_0_0/65%)] ring-1 ring-white/15',
        props.className
      )}
    >
      <div className="overflow-hidden rounded-[2.1rem] bg-[#15181c]">
        <div className="flex h-7 items-center justify-center">
          <span className="h-[0.9rem] w-[34%] rounded-full bg-black" />
        </div>
        <Image
          src="/app-phone.webp"
          width={1179}
          height={2556}
          sizes="(min-width: 768px) 320px, 60vw"
          alt="The same thread in OffSite on a phone"
          className="w-full"
        />
      </div>
    </div>
  )
}
