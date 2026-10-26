declare module 'monaco-editor/platform/actions/common/actions' {
  export const MenuId: { DiffEditorHunkToolbar: object }
  export const MenuRegistry: {
    appendMenuItem(
      menu: object,
      item: {
        command: { id: string; title: string; icon: { id: string } }
        group: string
        order: number
      }
    ): { dispose(): void }
  }
}
