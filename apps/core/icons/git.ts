const stroke = {
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  strokeWidth: '1.5',
} as const

const branchBase = [
  [
    'path',
    {
      d: 'M6 9C7.65685 9 9 7.65685 9 6C9 4.34315 7.65685 3 6 3C4.34315 3 3 4.34315 3 6C3 7.65685 4.34315 9 6 9Z',
      key: 'top',
      ...stroke,
    },
  ],
  [
    'path',
    {
      d: 'M6 21C7.65685 21 9 19.6569 9 18C9 16.3431 7.65685 15 6 15C4.34315 15 3 16.3431 3 18C3 19.6569 4.34315 21 6 21Z',
      key: 'bottom',
      ...stroke,
    },
  ],
  [
    'path',
    {
      d: 'M6 15V9M18 9C18 10.6569 16.6569 12 15 12H9C7.34315 12 6 13.3431 6 15',
      key: 'line',
      ...stroke,
    },
  ],
] as const

export const BranchIcon = [
  ...branchBase,
  [
    'path',
    {
      d: 'M18 9C19.6569 9 21 7.65685 21 6C21 4.34315 19.6569 3 18 3C16.3431 3 15 4.34315 15 6C15 7.65685 16.3431 9 18 9Z',
      key: 'end',
      ...stroke,
    },
  ],
] as const

export const NewBranchIcon = [
  ...branchBase,
  ['path', { d: 'M18 2V7M15.5 4.5H20.5', key: 'end', ...stroke }],
] as const

export const DeleteBranchIcon = [
  ...branchBase,
  ['path', { d: 'M15.5 4.5H20.5', key: 'end', ...stroke }],
] as const

const worktreeBase = [
  [
    'path',
    {
      d: 'M2.25 12.75H11.25M11.25 8.25V17.25A1.5 1.5 0 0 0 12.75 18.75H21.75M18.75 15.75L21.75 18.75L18.75 21.75',
      key: 'base',
      ...stroke,
    },
  ],
] as const

export const WorktreeIcon = [
  ...worktreeBase,
  [
    'path',
    {
      d: 'M11.25 8.25A1.5 1.5 0 0 1 12.75 6.75H21.75M18.75 3.75L21.75 6.75L18.75 9.75',
      key: 'end',
      ...stroke,
    },
  ],
] as const

export const NewWorktreeIcon = [
  ...worktreeBase,
  [
    'path',
    {
      d: 'M11.25 8.25A1.5 1.5 0 0 1 12.75 6.75H14.25M19.5 3.75V9.75M16.5 6.75H22.5',
      key: 'end',
      ...stroke,
    },
  ],
] as const

export const DeleteWorktreeIcon = [
  ...worktreeBase,
  [
    'path',
    {
      d: 'M11.25 8.25A1.5 1.5 0 0 1 12.75 6.75H14.25M16.5 6.75H22.5',
      key: 'end',
      ...stroke,
    },
  ],
] as const
