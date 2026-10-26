declare module 'monaco-editor/platform/actions/common/actions' {
  export const MenuId: { DiffEditorHunkToolbar: object }
  export const MenuRegistry: {
    appendMenuItem(
      menu: object,
      item: {
        command: { id: string; title: string; icon: { id: string } }
        when: object
        group: string
        order: number
      }
    ): { dispose(): void }
  }
}

declare module 'monaco-editor/platform/contextkey/common/contextkey' {
  export const ContextKeyExpr: { has(key: string): object }
}
