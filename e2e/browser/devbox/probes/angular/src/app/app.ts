import { Component, afterNextRender, signal } from '@angular/core'

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
})
export class App {
  protected readonly count = signal(0)
  protected readonly where = signal('')
  protected readonly api = signal('')
  protected readonly cookie = signal('')

  constructor() {
    afterNextRender(() => this.where.set(location.href))
  }

  protected async callApi() {
    const response = await fetch('/probe.json')
    const data = await response.json()
    this.api.set(data.message)
    this.cookie.set(document.cookie.includes('probe=yes') ? 'yes' : 'no')
  }
}
