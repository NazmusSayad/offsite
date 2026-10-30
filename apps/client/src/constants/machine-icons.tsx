import {
  AndroidIcon,
  AppleIcon,
  AppStoreIcon,
  Building03Icon,
  CloudServerIcon,
  ComputerIcon,
  HardDriveIcon,
  HelpCircleIcon,
  Home01Icon,
  LaptopIcon,
  MicrosoftIcon,
  ServerStack01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { cloneElement, type ReactElement } from 'react'
import { BsAmd } from 'react-icons/bs'
import { FaApple, FaChrome, FaFish, FaUbuntu, FaWindows } from 'react-icons/fa'
import { FaUbuntu as FaUbuntu6 } from 'react-icons/fa6'
import { GrAppleAppStore, GrHpi } from 'react-icons/gr'
import { ImFinder } from 'react-icons/im'
import {
  SiAcer,
  SiAlpinelinux,
  SiArchlinux,
  SiArm,
  SiAsus,
  SiCentos,
  SiDebian,
  SiDell,
  SiDigitalocean,
  SiDocker,
  SiFedora,
  SiFreebsd,
  SiGarudalinux,
  SiGentoo,
  SiHetzner,
  SiHp,
  SiHuawei,
  SiIntel,
  SiKalilinux,
  SiLenovo,
  SiLinuxmint,
  SiManjaro,
  SiMsibusiness,
  SiNixos,
  SiNvidia,
  SiOpensuse,
  SiPopos,
  SiProxmox,
  SiQualcomm,
  SiRaspberrypi,
  SiRazer,
  SiRedhat,
  SiSamsung,
  SiUbuntu,
  SiXiaomi,
  SiZsh,
} from 'react-icons/si'
import { TfiApple } from 'react-icons/tfi'
import {
  VscAzure,
  VscTerminal,
  VscTerminalBash,
  VscTerminalCmd,
  VscTerminalGitBash,
  VscTerminalLinux,
  VscTerminalPowershell,
  VscVscodeOutline,
} from 'react-icons/vsc'

type MachineIcon = {
  icon: ReactElement<{ className?: string }>
  group:
    | 'Devices'
    | 'Apple'
    | 'Windows'
    | 'Linux & BSD'
    | 'Hosting'
    | 'Brands'
    | 'Other'
}

export const machineIcons: Record<string, MachineIcon> = {
  computer: {
    icon: <HugeiconsIcon icon={ComputerIcon} />,
    group: 'Devices',
  },
  laptop: {
    icon: <HugeiconsIcon icon={LaptopIcon} />,
    group: 'Devices',
  },
  server: {
    icon: <HugeiconsIcon icon={ServerStack01Icon} />,
    group: 'Devices',
  },
  cloud: {
    icon: <HugeiconsIcon icon={CloudServerIcon} />,
    group: 'Devices',
  },
  home: {
    icon: <HugeiconsIcon icon={Home01Icon} />,
    group: 'Devices',
  },
  office: {
    icon: <HugeiconsIcon icon={Building03Icon} />,
    group: 'Devices',
  },
  drive: {
    icon: <HugeiconsIcon icon={HardDriveIcon} />,
    group: 'Devices',
  },
  raspberrypi: {
    icon: <SiRaspberrypi size={24} />,
    group: 'Devices',
  },
  macos: {
    icon: (
      <svg
        viewBox="1.5 1.5 21 21"
        width={24}
        height={24}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2.5 12C2.5 7.52166 2.5 5.28249 3.89124 3.89124C5.28249 2.5 7.52166 2.5 12 2.5C16.4783 2.5 18.7175 2.5 20.1088 3.89124C21.5 5.28249 21.5 7.52166 21.5 12C21.5 16.4783 21.5 18.7175 20.1088 20.1088C18.7175 21.5 16.4783 21.5 12 21.5C7.52166 21.5 5.28249 21.5 3.89124 20.1088C2.5 18.7175 2.5 16.4783 2.5 12Z" />
        <path d="M7 8V10" />
        <path d="M17 8V10" />
        <path d="M7 16.5C10.5 18.5 13.5 18.5 17 16.5" />
        <path d="M12.9896 2.5C12.1238 3.78525 10.5163 7.71349 10.0737 11.5798C9.98097 12.3899 9.9346 12.795 10.1905 13.1176C10.2151 13.1486 10.2474 13.1843 10.2757 13.212C10.5708 13.5 11.0149 13.5 11.9031 13.5C12.3889 13.5 12.6317 13.5 12.7766 13.6314C12.7923 13.6457 12.8051 13.6588 12.819 13.6748C12.9468 13.8225 12.9383 14.072 12.9212 14.5709C12.8685 16.1156 12.9401 19.0524 14 21.5" />
      </svg>
    ),
    group: 'Apple',
  },
  finder: {
    icon: <ImFinder size={24} />,
    group: 'Apple',
  },
  apple: {
    icon: <HugeiconsIcon icon={AppleIcon} />,
    group: 'Apple',
  },
  applelogo: {
    icon: <FaApple size={24} />,
    group: 'Apple',
  },
  appletfi: {
    icon: <TfiApple size={24} />,
    group: 'Apple',
  },
  appstore: {
    icon: <GrAppleAppStore size={24} />,
    group: 'Apple',
  },
  appstoreoutline: {
    icon: <HugeiconsIcon icon={AppStoreIcon} />,
    group: 'Apple',
  },
  windows: {
    icon: <HugeiconsIcon icon={MicrosoftIcon} />,
    group: 'Windows',
  },
  windowslogo: {
    icon: <FaWindows size={24} />,
    group: 'Windows',
  },
  wsl: {
    icon: (
      <svg viewBox="0 0 380 380" width={24} height={24} fill="currentColor">
        <g transform="translate(0,380) scale(0.1,-0.1)">
          <path d="M1693 3780 c-70 -10 -285 -65 -311 -80 -9 -6 -52 -25 -94 -44 -388 -173 -699 -573 -785 -1011 -16 -82 -18 -192 -20 -1305 -3 -1172 -3 -1216 15 -1250 11 -19 37 -45 58 -57 l39 -23 1297 0 c895 0 1305 3 1325 11 38 14 72 47 89 88 22 53 21 2278 -2 2441 -21 159 -65 304 -133 445 -132 273 -346 494 -613 635 -119 62 -201 93 -336 126 -91 22 -135 27 -287 29 -99 2 -208 0 -242 -5z m-278 -811 c139 -37 261 -135 321 -259 50 -102 56 -155 54 -429 -1 -135 -2 -250 -1 -256 1 -6 45 -10 111 -10 l110 0 0 281 c0 253 2 289 20 346 60 196 253 338 460 338 133 0 255 -55 350 -157 68 -73 92 -114 114 -200 23 -89 24 -1202 1 -1354 -57 -376 -307 -694 -655 -832 -153 -61 -212 -71 -400 -72 -169 0 -179 1 -289 33 -294 84 -516 263 -664 532 -38 70 -90 219 -108 309 -7 35 -13 289 -16 688 -4 568 -3 638 12 690 62 215 249 361 465 362 41 1 93 -4 115 -10z" />
          <path d="M1210 2594 c-120 -52 -173 -198 -116 -320 50 -108 185 -162 292 -118 121 50 179 172 142 295 -15 52 -73 117 -122 140 -50 23 -147 24 -196 3z" />
          <path d="M2383 2589 c-72 -35 -133 -133 -133 -212 0 -121 116 -237 239 -237 86 0 172 53 212 131 23 46 26 153 5 202 -19 45 -94 115 -136 127 -60 17 -141 12 -187 -11z" />
          <path d="M2345 1572 c-19 -18 -148 -63 -238 -84 -70 -16 -125 -21 -232 -20 -144 0 -215 11 -344 53 -53 18 -65 19 -73 8 -8 -11 -9 -10 -4 3 3 10 1 20 -4 23 -14 9 -12 -58 3 -131 26 -121 112 -228 240 -296 l82 -43 120 0 c117 0 122 1 197 37 106 50 171 114 219 212 21 43 41 97 44 120 9 57 3 130 -10 118z" />
        </g>
      </svg>
    ),
    group: 'Windows',
  },
  powershell: {
    icon: <VscTerminalPowershell size={24} />,
    group: 'Windows',
  },
  cmd: {
    icon: <VscTerminalCmd size={24} />,
    group: 'Windows',
  },
  linux: {
    icon: <VscTerminalLinux size={24} />,
    group: 'Linux & BSD',
  },
  ubuntu: {
    icon: <SiUbuntu size={24} />,
    group: 'Linux & BSD',
  },
  ubuntufa: {
    icon: <FaUbuntu size={24} />,
    group: 'Linux & BSD',
  },
  ubuntufa6: {
    icon: <FaUbuntu6 size={24} />,
    group: 'Linux & BSD',
  },
  linuxmint: {
    icon: <SiLinuxmint size={24} />,
    group: 'Linux & BSD',
  },
  archlinux: {
    icon: <SiArchlinux size={24} />,
    group: 'Linux & BSD',
  },
  garuda: {
    icon: <SiGarudalinux size={24} />,
    group: 'Linux & BSD',
  },
  kali: {
    icon: <SiKalilinux size={24} />,
    group: 'Linux & BSD',
  },
  debian: {
    icon: <SiDebian size={24} />,
    group: 'Linux & BSD',
  },
  fedora: {
    icon: <SiFedora size={24} />,
    group: 'Linux & BSD',
  },
  centos: {
    icon: <SiCentos size={24} />,
    group: 'Linux & BSD',
  },
  redhat: {
    icon: <SiRedhat size={24} />,
    group: 'Linux & BSD',
  },
  opensuse: {
    icon: <SiOpensuse size={24} />,
    group: 'Linux & BSD',
  },
  manjaro: {
    icon: <SiManjaro size={24} />,
    group: 'Linux & BSD',
  },
  nixos: {
    icon: <SiNixos size={24} />,
    group: 'Linux & BSD',
  },
  popos: {
    icon: <SiPopos size={24} />,
    group: 'Linux & BSD',
  },
  alpine: {
    icon: <SiAlpinelinux size={24} />,
    group: 'Linux & BSD',
  },
  gentoo: {
    icon: <SiGentoo size={24} />,
    group: 'Linux & BSD',
  },
  freebsd: {
    icon: <SiFreebsd size={24} />,
    group: 'Linux & BSD',
  },
  docker: {
    icon: <SiDocker size={24} />,
    group: 'Hosting',
  },
  proxmox: {
    icon: <SiProxmox size={24} />,
    group: 'Hosting',
  },
  digitalocean: {
    icon: <SiDigitalocean size={24} />,
    group: 'Hosting',
  },
  hetzner: {
    icon: <SiHetzner size={24} />,
    group: 'Hosting',
  },
  azure: {
    icon: <VscAzure size={24} />,
    group: 'Hosting',
  },
  asus: {
    icon: <SiAsus size={24} />,
    group: 'Brands',
  },
  dell: {
    icon: <SiDell size={24} />,
    group: 'Brands',
  },
  hp: {
    icon: <SiHp size={24} />,
    group: 'Brands',
  },
  hpi: {
    icon: <GrHpi size={24} />,
    group: 'Brands',
  },
  lenovo: {
    icon: <SiLenovo size={24} />,
    group: 'Brands',
  },
  acer: {
    icon: <SiAcer size={24} />,
    group: 'Brands',
  },
  msi: {
    icon: <SiMsibusiness size={24} />,
    group: 'Brands',
  },
  razer: {
    icon: <SiRazer size={24} />,
    group: 'Brands',
  },
  samsung: {
    icon: <SiSamsung size={24} />,
    group: 'Brands',
  },
  huawei: {
    icon: <SiHuawei size={24} />,
    group: 'Brands',
  },
  xiaomi: {
    icon: <SiXiaomi size={24} />,
    group: 'Brands',
  },
  intel: {
    icon: <SiIntel size={24} />,
    group: 'Brands',
  },
  amd: {
    icon: <BsAmd size={24} />,
    group: 'Brands',
  },
  nvidia: {
    icon: <SiNvidia size={24} />,
    group: 'Brands',
  },
  arm: {
    icon: <SiArm size={24} />,
    group: 'Brands',
  },
  qualcomm: {
    icon: <SiQualcomm size={24} />,
    group: 'Brands',
  },
  android: {
    icon: <HugeiconsIcon icon={AndroidIcon} />,
    group: 'Other',
  },
  chrome: {
    icon: <FaChrome size={24} />,
    group: 'Other',
  },
  vscode: {
    icon: <VscVscodeOutline size={24} />,
    group: 'Other',
  },
  terminal: {
    icon: <VscTerminal size={24} />,
    group: 'Other',
  },
  bash: {
    icon: <VscTerminalBash size={24} />,
    group: 'Other',
  },
  gitbash: {
    icon: <VscTerminalGitBash size={24} />,
    group: 'Other',
  },
  zsh: {
    icon: <SiZsh size={24} />,
    group: 'Other',
  },
  fish: {
    icon: <FaFish size={24} />,
    group: 'Other',
  },
}

export const quickMachineIcons = ['macos', 'windows', 'linux']

export function MachineLogo(props: {
  icon: string | null
  className?: string
}) {
  if (props.icon === null) {
    return cloneElement(machineIcons.computer.icon, {
      className: props.className,
    })
  }

  const item = machineIcons[props.icon]
  if (item === undefined) {
    return <HugeiconsIcon icon={HelpCircleIcon} className={props.className} />
  }

  return cloneElement(item.icon, { className: props.className })
}
