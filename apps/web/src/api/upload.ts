import { call } from './connection'

const UPLOAD_LIMIT = 50 * 1024 * 1024

export async function uploadFile(machine: string, file: File) {
  if (file.size > UPLOAD_LIMIT) {
    throw new Error('File is larger than 50 MB')
  }
  return call(machine, 'files.upload', {
    name: file.name,
    data: await readBase64(file),
  })
}

export function readBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result)
      resolve(url.slice(url.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
