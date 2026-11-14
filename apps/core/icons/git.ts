const stroke = {
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  strokeWidth: '1.5',
} as const

export const BranchIcon = [
  ['circle', { cx: '6', cy: '6', r: '2', key: 'top', ...stroke }],
  ['circle', { cx: '6', cy: '18', r: '2', key: 'bottom', ...stroke }],
  ['circle', { cx: '18', cy: '6', r: '2', key: 'end', ...stroke }],
  [
    'path',
    {
      d: 'M6 8V16M18 8V9C18 10.6569 16.6569 12 15 12H9C7.34315 12 6 13.3431 6 15',
      key: 'line',
      ...stroke,
    },
  ],
] as const

export const NewBranchIcon = [
  ...BranchIcon,
  ['path', { d: 'M18 15V21M15 18H21', key: 'add', ...stroke }],
] as const

export const DeleteBranchIcon = [
  ...BranchIcon,
  [
    'path',
    { d: 'M15.5 15.5L20.5 20.5M20.5 15.5L15.5 20.5', key: 'remove', ...stroke },
  ],
] as const

export const WorktreeIcon = [
  [
    'path',
    {
      d: 'M2.25 12.75H11.25M15.25 6.75C13.0409 6.75 11.25 8.54086 11.25 10.75V14.75C11.25 16.9591 13.0409 18.75 15.25 18.75M15.25 6.75H21.25M15.25 18.75H21.25',
      key: 'base',
      ...stroke,
    },
  ],
  [
    'path',
    {
      d: 'M18.25 3.75C18.25 3.75 21.25 5.95949 21.25 6.75C21.25 7.54051 18.25 9.75 18.25 9.75M18.25 15.75C18.25 15.75 21.25 17.9595 21.25 18.75C21.25 19.5405 18.25 21.75 18.25 21.75',
      key: 'heads',
      ...stroke,
    },
  ],
] as const

export const NewWorktreeIcon = [
  ...WorktreeIcon,
  ['path', { d: 'M5.25 2.25V8.25M2.25 5.25H8.25', key: 'add', ...stroke }],
] as const

export const DeleteWorktreeIcon = [
  ...WorktreeIcon,
  [
    'path',
    { d: 'M2.75 2.75L7.75 7.75M7.75 2.75L2.75 7.75', key: 'remove', ...stroke },
  ],
] as const
