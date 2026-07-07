/**
 * 指定時間内に resolve/reject されなければ、代わりにタイムアウトエラーで reject する。
 *
 * WebKitGTK 環境では、getUserMedia() 等のブラウザ API が(権限リクエストの
 * 取りこぼしや GStreamer 側の問題で)resolve も reject もされないまま
 * 無限に待機し続けることがある。呼び出し元がハングし続けないよう、
 * 待ち時間の上限を保証するために使う。
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        window.clearTimeout(timer);
        reject(err);
      },
    );
  });
}
