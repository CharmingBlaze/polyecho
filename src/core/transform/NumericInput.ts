export class NumericInput {
  private buffer = ''
  private _active = false

  get active(): boolean {
    return this._active
  }

  get text(): string {
    return this.buffer
  }

  reset() {
    this.buffer = ''
    this._active = false
  }

  handleKey(key: string): boolean {
    if (['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(key)) {
      this.buffer += key
      this._active = true
      return true
    } else if (key === '.' && !this.buffer.includes('.')) {
      this.buffer += this.buffer === '' ? '0.' : '.'
      this._active = true
      return true
    } else if (key === '-') {
      if (this.buffer.startsWith('-')) {
        this.buffer = this.buffer.substring(1)
      } else {
        this.buffer = '-' + this.buffer
      }
      this._active = true
      return true
    } else if (key === 'Backspace') {
      if (this.buffer.length > 0) {
        this.buffer = this.buffer.slice(0, -1)
        if (this.buffer.length === 0) {
          this._active = false
        }
        return true
      }
    }
    return false
  }

  getValue(): number | null {
    if (!this._active || this.buffer === '' || this.buffer === '-') return null
    const val = parseFloat(this.buffer)
    return isNaN(val) ? null : val
  }
}
